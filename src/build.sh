#!/usr/bin/env bash
# Build the dot converter to WebAssembly.
#
# Requires the Emscripten SDK on PATH (`emcc`). Install it from the public
# distribution at https://github.com/emscripten-core/emsdk:
#
#   git clone https://github.com/emscripten-core/emsdk.git
#   cd emsdk && ./emsdk install latest && ./emsdk activate latest
#   source ./emsdk_env.sh
set -euo pipefail

cd "$(dirname "$0")"
out="../web/src/wasm"
mkdir -p "$out"

# SINGLE_FILE embeds the wasm as base64 in the JS glue, so Vite bundles it with
# no separate asset to resolve.
emcc converter.cpp \
  -lembind \
  -O3 \
  -flto \
  -std=c++23 \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s EXPORT_NAME=createConverter \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s ENVIRONMENT=web,worker \
  -s SINGLE_FILE=1 \
  -o "$out/converter.js"

echo "built -> $out/converter.js"
