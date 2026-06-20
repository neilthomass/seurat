#include <emscripten/bind.h>
#include <emscripten/val.h>

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <unordered_set>
#include <vector>

using emscripten::val;

namespace {
inline double luma(double r, double g, double b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
inline uint8_t toByte(double v) {
  return v <= 0 ? 0 : v >= 255 ? 255 : static_cast<uint8_t>(std::lround(v));
}
// Snap a channel to one of the 16 .seurat levels (4-bit color): v -> round(v/17)*17.
inline uint8_t quant4(uint8_t v) {
  return static_cast<uint8_t>(std::lround(v / 17.0) * 17);
}
inline uint64_t key(int x, int y) {
  return (static_cast<uint64_t>(static_cast<uint32_t>(x)) << 32) |
         static_cast<uint32_t>(y);
}
}  // namespace

class DotConverter {
 public:
  void setContrast(double percent) { contrast_ = percent / 100.0; }
  void setExposure(double exposure) { exposure_ = exposure; }
  void setWhiteThreshold(double threshold) { whiteThreshold_ = threshold; }

  void clearMask() { masked_.clear(); }
  void addMaskPixel(int x, int y) { masked_.insert(key(x, y)); }

  int gridHeight(int srcWidth, int srcHeight, int gridWidth) const {
    if (srcWidth <= 0 || gridWidth <= 0) return 0;
    int h = static_cast<int>(std::floor(double(gridWidth) * srcHeight / srcWidth));
    return std::max(h, 1);
  }

  val convertFrame(val rgba, int width, int height) {
    const std::vector<uint8_t> src =
        emscripten::convertJSArrayToNumberVector<uint8_t>(rgba);
    const size_t n = size_t(width) * height;

    rgb_.resize(n * 3);
    for (size_t i = 0; i < n; ++i) {
      double r = src[i * 4 + 0] + exposure_;
      double g = src[i * 4 + 1] + exposure_;
      double b = src[i * 4 + 2] + exposure_;
      rgb_[i * 3 + 0] = toByte((r - 128) * contrast_ + 128);
      rgb_[i * 3 + 1] = toByte((g - 128) * contrast_ + 128);
      rgb_[i * 3 + 2] = toByte((b - 128) * contrast_ + 128);
    }

    double minL = 255, maxL = 0;
    for (size_t i = 0; i < n; ++i) {
      double l = luma(rgb_[i * 3], rgb_[i * 3 + 1], rgb_[i * 3 + 2]);
      minL = std::min(minL, l);
      maxL = std::max(maxL, l);
    }
    double range = maxL - minL;
    if (range == 0) range = 1;

    out_.resize(n * 3);
    for (size_t i = 0; i < n; ++i) {
      double r = rgb_[i * 3], g = rgb_[i * 3 + 1], b = rgb_[i * 3 + 2];
      double l = luma(r, g, b);
      double f = l > 0 ? ((l - minL) / range) * 255 / l : 1;
      uint8_t R = toByte(r * f), G = toByte(g * f), B = toByte(b * f);

      int x = int(i % width), y = int(i / width);
      bool empty = masked_.count(key(x, y)) || luma(R, G, B) >= whiteThreshold_;
      // Quantize to 4-bit color so the core output matches the .seurat format.
      out_[i * 3 + 0] = empty ? 255 : quant4(R);
      out_[i * 3 + 1] = empty ? 255 : quant4(G);
      out_[i * 3 + 2] = empty ? 255 : quant4(B);
    }
    return val(emscripten::typed_memory_view(out_.size(), out_.data()));
  }

 private:
  double contrast_ = 1.0;
  double exposure_ = 0.0;
  double whiteThreshold_ = 240;
  std::unordered_set<uint64_t> masked_;
  std::vector<uint8_t> rgb_;
  std::vector<uint8_t> out_;
};

EMSCRIPTEN_BINDINGS(seurat) {
  emscripten::class_<DotConverter>("DotConverter")
      .constructor<>()
      .function("setContrast", &DotConverter::setContrast)
      .function("setExposure", &DotConverter::setExposure)
      .function("setWhiteThreshold", &DotConverter::setWhiteThreshold)
      .function("clearMask", &DotConverter::clearMask)
      .function("addMaskPixel", &DotConverter::addMaskPixel)
      .function("gridHeight", &DotConverter::gridHeight)
      .function("convertFrame", &DotConverter::convertFrame);
}
