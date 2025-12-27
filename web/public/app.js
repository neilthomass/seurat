document.addEventListener('DOMContentLoaded', () => {
    const progressDiv = document.getElementById('progress');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const resultMp4Div = document.getElementById('resultMp4');
    const resultTextDiv = document.getElementById('resultText');
    const outputVideo = document.getElementById('outputVideo');
    const downloadMp4Btn = document.getElementById('downloadMp4');
    const downloadTextBtn = document.getElementById('downloadText');
    const convertMp4Btn = document.getElementById('convertMp4Btn');
    const convertTextBtn = document.getElementById('convertTextBtn');
    const convertSvgBtn = document.getElementById('convertSvgBtn');
    const errorDiv = document.getElementById('error');
    const errorMessage = document.getElementById('errorMessage');
    const previewDiv = document.getElementById('preview');
    const previewSvgContainer = document.getElementById('previewSvgContainer');
    const thresholdInput = document.getElementById('threshold');
    const thresholdValue = document.getElementById('thresholdValue');
    const contrastInput = document.getElementById('contrast');
    const contrastValue = document.getElementById('contrastValue');
    const exposureInput = document.getElementById('exposure');
    const exposureValue = document.getElementById('exposureValue');
    const scaleInput = document.getElementById('scale');
    const scaleValueSpan = document.getElementById('scaleValue');
    const videoInput = document.getElementById('video');
    const widthInput = document.getElementById('width');
    const charsInput = document.getElementById('chars');

    const frameSlider = document.getElementById('frameSlider');
    const frameValue = document.getElementById('frameValue');
    const frameTotalValue = document.getElementById('frameTotalValue');
    const skipStartFramesInput = document.getElementById('skipStartFrames');
    const skipEndFramesInput = document.getElementById('skipEndFrames');
    const fpsInput = document.getElementById('fps');
    const noiseLevelInput = document.getElementById('noiseLevel');

    // Settings persistence
    const SETTINGS_KEY = 'seurat_settings';

    function saveSettings() {
        const settings = {
            threshold: thresholdInput.value,
            contrast: contrastInput.value,
            exposure: exposureInput.value,
            scale: scaleInput.value,
            width: widthInput.value,
            chars: charsInput.value,
            fps: fpsInput.value,
            noiseLevel: noiseLevelInput.value,
            skipStartFrames: skipStartFramesInput.value,
            skipEndFrames: skipEndFramesInput.value
        };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }

    function loadSettings() {
        try {
            const saved = localStorage.getItem(SETTINGS_KEY);
            if (!saved) return;
            const settings = JSON.parse(saved);

            if (settings.threshold !== undefined) {
                thresholdInput.value = settings.threshold;
                thresholdValue.textContent = settings.threshold;
            }
            if (settings.contrast !== undefined) {
                contrastInput.value = settings.contrast;
                contrastValue.textContent = settings.contrast;
            }
            if (settings.exposure !== undefined) {
                exposureInput.value = settings.exposure;
                exposureValue.textContent = settings.exposure;
            }
            if (settings.scale !== undefined) {
                scaleInput.value = settings.scale;
                scaleValueSpan.textContent = settings.scale;
            }
            if (settings.width !== undefined) {
                widthInput.value = settings.width;
            }
            if (settings.chars !== undefined) {
                charsInput.value = settings.chars;
            }
            if (settings.fps !== undefined) {
                fpsInput.value = settings.fps;
            }
            if (settings.noiseLevel !== undefined) {
                noiseLevelInput.value = settings.noiseLevel;
            }
            if (settings.skipStartFrames !== undefined) {
                skipStartFramesInput.value = settings.skipStartFrames;
            }
            if (settings.skipEndFrames !== undefined) {
                skipEndFramesInput.value = settings.skipEndFrames;
            }
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
    }

    // Load saved settings on startup
    loadSettings();

    let currentMp4Result = null;
    let currentTextResult = null;
    let previewVideo = null;
    let previewSourceCanvas = null;
    let previewFrameCanvases = [];
    let previewTotalFrames = 0;
    let currentVideoFileName = '';
    let maskedPixels = new Set(); // Set of "x,y" strings for masked (deleted) pixels
    let selectionBox = null; // Selection box element
    let selectionStart = null; // {x, y} start point of selection
    let currentSvg = null; // Reference to current SVG for selection handlers

    // Create selection box element once
    selectionBox = document.createElement('div');
    selectionBox.style.cssText = `
        position: fixed;
        border: 2px dashed #ff4444;
        background: rgba(255, 68, 68, 0.1);
        pointer-events: none;
        display: none;
        z-index: 1000;
    `;
    document.body.appendChild(selectionBox);

    // Global mouse move handler for selection
    document.addEventListener('mousemove', (e) => {
        if (!selectionStart) return;

        const x = Math.min(selectionStart.x, e.clientX);
        const y = Math.min(selectionStart.y, e.clientY);
        const w = Math.abs(e.clientX - selectionStart.x);
        const h = Math.abs(e.clientY - selectionStart.y);

        selectionBox.style.left = x + 'px';
        selectionBox.style.top = y + 'px';
        selectionBox.style.width = w + 'px';
        selectionBox.style.height = h + 'px';
    });

    // Global mouse up handler for selection
    document.addEventListener('mouseup', (e) => {
        if (!selectionStart || !currentSvg) return;

        const boxRect = selectionBox.getBoundingClientRect();
        selectionBox.style.display = 'none';

        // Only process if box has some size
        if (boxRect.width > 5 && boxRect.height > 5) {
            const svgRect = currentSvg.getBoundingClientRect();

            // Get the viewBox to calculate scale
            const viewBox = currentSvg.getAttribute('viewBox');
            const [, , vbWidth, vbHeight] = viewBox.split(' ').map(Number);
            const scaleX = svgRect.width / vbWidth;
            const scaleY = svgRect.height / vbHeight;

            // Find all circles within the selection box
            currentSvg.querySelectorAll('circle').forEach(circle => {
                const cx = parseFloat(circle.getAttribute('cx'));
                const cy = parseFloat(circle.getAttribute('cy'));

                // Convert circle center to screen coordinates using scale
                const screenX = svgRect.left + (cx * scaleX);
                const screenY = svgRect.top + (cy * scaleY);

                // Check if circle center is within selection box
                if (screenX >= boxRect.left && screenX <= boxRect.right &&
                    screenY >= boxRect.top && screenY <= boxRect.bottom) {
                    const x = parseInt(circle.getAttribute('data-x'));
                    const y = parseInt(circle.getAttribute('data-y'));
                    const key = `${x},${y}`;
                    maskedPixels.add(key);
                    circle.remove();
                }
            });
        }

        selectionStart = null;
    });

    // Preview functionality
    videoInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) {
            previewDiv.classList.add('hidden');
            previewSvgContainer.classList.add('hidden');
            previewSvgContainer.innerHTML = '';
            currentVideoFileName = '';
            return;
        }

        currentVideoFileName = file.name.replace(/\.[^/.]+$/, ''); // Remove extension
        maskedPixels.clear(); // Clear masks when loading new video

        previewVideo = document.createElement('video');
        previewVideo.muted = true;
        previewVideo.playsInline = true;
        previewFrameCanvases = [];

        previewVideo.onloadedmetadata = async () => {
            const duration = previewVideo.duration;
            const numFrames = Math.min(100, Math.floor(duration * 10));
            const frameInterval = duration / numFrames;
            previewTotalFrames = numFrames;

            for (let i = 0; i < numFrames; i++) {
                await new Promise((resolve) => {
                    previewVideo.currentTime = i * frameInterval;
                    previewVideo.onseeked = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = previewVideo.videoWidth;
                        canvas.height = previewVideo.videoHeight;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(previewVideo, 0, 0);
                        previewFrameCanvases.push(canvas);
                        resolve();
                    };
                });
            }

            updateFrameSliderRange();
            previewDiv.classList.remove('hidden');
            previewSvgContainer.classList.remove('hidden');
            updatePreview();
        };

        previewVideo.src = URL.createObjectURL(file);
    });

    function updateFrameSliderRange() {
        if (previewTotalFrames === 0) return;

        const skipStart = parseInt(skipStartFramesInput.value) || 0;
        const skipEnd = parseInt(skipEndFramesInput.value) || 0;
        const effectiveFrames = Math.max(0, previewTotalFrames - skipStart - skipEnd);

        frameSlider.min = 0;
        frameSlider.max = Math.max(0, effectiveFrames - 1);
        frameSlider.value = Math.min(parseInt(frameSlider.value) || 0, frameSlider.max);
        frameValue.textContent = frameSlider.value;
        frameTotalValue.textContent = Math.max(0, effectiveFrames - 1);

        const actualFrameIndex = skipStart + parseInt(frameSlider.value);
        if (previewFrameCanvases[actualFrameIndex]) {
            previewSourceCanvas = previewFrameCanvases[actualFrameIndex];
            updatePreview();
        }
    }

    frameSlider.addEventListener('input', () => {
        const skipStart = parseInt(skipStartFramesInput.value) || 0;
        const sliderValue = parseInt(frameSlider.value);
        const actualFrameIndex = skipStart + sliderValue;

        frameValue.textContent = sliderValue;
        if (previewFrameCanvases[actualFrameIndex]) {
            previewSourceCanvas = previewFrameCanvases[actualFrameIndex];
            updatePreview();
        }
    });

    function updatePreview() {
        if (!previewSourceCanvas) return;

        const asciiWidth = parseInt(widthInput.value) || 300;
        const threshold = parseInt(thresholdInput.value) || 240;
        const contrast = parseInt(contrastInput.value) || 100;
        const exposure = parseInt(exposureInput.value) ?? -100;
        const scale = (parseInt(scaleInput.value) || 100) / 100;

        // Calculate dimensions (square pixels, 1:1 aspect)
        const aspectRatio = previewSourceCanvas.height / previewSourceCanvas.width;
        const asciiHeight = Math.floor(asciiWidth * aspectRatio);

        // Calculate cell size based on window width and scale
        const cellSize = (window.innerWidth / asciiWidth) * scale;
        const svgWidth = asciiWidth * cellSize;
        const svgHeight = asciiHeight * cellSize;

        // Create temporary canvas to get processed pixel data
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = asciiWidth;
        tempCanvas.height = asciiHeight;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(previewSourceCanvas, 0, 0, asciiWidth, asciiHeight);
        let imageData = tempCtx.getImageData(0, 0, asciiWidth, asciiHeight);

        // Apply contrast and exposure
        const contrastFactor = contrast / 100;
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            for (let c = 0; c < 3; c++) {
                let value = data[i + c];
                value += exposure;
                value = (value - 128) * contrastFactor + 128;
                data[i + c] = Math.min(255, Math.max(0, value));
            }
        }

        // Auto-contrast
        let minL = 255, maxL = 0;
        for (let i = 0; i < data.length; i += 4) {
            const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            minL = Math.min(minL, l);
            maxL = Math.max(maxL, l);
        }
        const range = maxL - minL || 1;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const l = 0.299 * r + 0.587 * g + 0.114 * b;
            const newL = ((l - minL) / range) * 255;
            const factor = l > 0 ? newL / l : 1;
            data[i] = Math.min(255, Math.max(0, r * factor));
            data[i + 1] = Math.min(255, Math.max(0, g * factor));
            data[i + 2] = Math.min(255, Math.max(0, b * factor));
        }

        // Build SVG using same logic as neiltthomas.com
        // viewBox uses cell-relative coordinates for crisp circles
        let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" style="background:#f5f0e8">`;

        const whiteThreshold = threshold / 255;

        for (let y = 0; y < asciiHeight; y++) {
            for (let x = 0; x < asciiWidth; x++) {
                const key = `${x},${y}`;
                if (maskedPixels.has(key)) continue; // Skip masked pixels

                const idx = (y * asciiWidth + x) * 4;
                const r = data[idx], g = data[idx + 1], b = data[idx + 2];
                const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

                // Match neiltthomas.com logic: skip if brightness >= threshold
                if (brightness >= whiteThreshold) continue;

                // Circle size: Math.min(1, (1 - brightness) + 0.3)
                const circleSize = Math.min(1, (1 - brightness) + 0.3);
                const radius = (cellSize * circleSize) / 2;
                const cx = x * cellSize + cellSize / 2;
                const cy = y * cellSize + cellSize / 2;

                svgContent += `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="rgb(${r},${g},${b})" data-x="${x}" data-y="${y}" style="cursor:pointer"/>`;
            }
        }

        svgContent += '</svg>';
        previewSvgContainer.innerHTML = svgContent;

        currentSvg = previewSvgContainer.querySelector('svg');
        if (!currentSvg) return;

        // Mouse down on SVG starts selection
        currentSvg.addEventListener('mousedown', (e) => {
            selectionStart = { x: e.clientX, y: e.clientY };
            selectionBox.style.left = e.clientX + 'px';
            selectionBox.style.top = e.clientY + 'px';
            selectionBox.style.width = '0px';
            selectionBox.style.height = '0px';
            selectionBox.style.display = 'block';
            e.preventDefault();
        });
    }

    thresholdInput.addEventListener('input', () => {
        thresholdValue.textContent = thresholdInput.value;
        saveSettings();
        updatePreview();
    });

    contrastInput.addEventListener('input', () => {
        contrastValue.textContent = contrastInput.value;
        saveSettings();
        updatePreview();
    });

    exposureInput.addEventListener('input', () => {
        exposureValue.textContent = exposureInput.value;
        saveSettings();
        updatePreview();
    });

    scaleInput.addEventListener('input', () => {
        scaleValueSpan.textContent = scaleInput.value;
        saveSettings();
        updatePreview();
    });

    widthInput.addEventListener('input', () => {
        saveSettings();
        updatePreview();
    });

    charsInput.addEventListener('input', () => {
        saveSettings();
        updatePreview();
    });

    fpsInput.addEventListener('input', saveSettings);
    noiseLevelInput.addEventListener('input', saveSettings);
    skipStartFramesInput.addEventListener('input', () => {
        saveSettings();
        updateFrameSliderRange();
    });
    skipEndFramesInput.addEventListener('input', () => {
        saveSettings();
        updateFrameSliderRange();
    });

    function getOptions() {
        const fpsInput = document.getElementById('fps');
        const noiseLevelInput = document.getElementById('noiseLevel');

        return {
            fps: parseInt(fpsInput.value) || 10,
            width: parseInt(widthInput.value) || 300,
            chars: charsInput.value || 'F$V* ',
            noiseLevel: (parseInt(noiseLevelInput.value) || 15) / 100,
            threshold: parseInt(thresholdInput.value) || 240,
            contrast: parseInt(contrastInput.value) || 100,
            exposure: parseInt(exposureInput.value) ?? -100,
            skipStartFrames: parseInt(skipStartFramesInput.value) || 0,
            skipEndFrames: parseInt(skipEndFramesInput.value) || 0,
            maskedPixels: new Set(maskedPixels) // Copy the masked pixels
        };
    }

    function validateOptions(options) {
        if (!videoInput.files[0]) {
            alert('Please select a video file');
            return false;
        }
        if (options.fps < 1 || options.fps > 30) {
            alert('FPS must be between 1 and 30');
            return false;
        }
        if (options.width < 40 || options.width > 720) {
            alert('Width must be between 40 and 720');
            return false;
        }
        return true;
    }

    function showProgress() {
        progressDiv.classList.remove('hidden');
        resultMp4Div.classList.add('hidden');
        resultTextDiv.classList.add('hidden');
        errorDiv.classList.add('hidden');
        progressBar.style.width = '0%';
        progressText.textContent = 'Loading video...';
    }

    function createProgressHandler() {
        return (progress) => {
            progressBar.style.width = `${progress.percent}%`;
            switch (progress.stage) {
                case 'loading':
                    progressText.textContent = 'Loading video...';
                    break;
                case 'extracting':
                    progressText.textContent = `Extracting frames: ${progress.current}/${progress.total}`;
                    break;
                case 'converting':
                    progressText.textContent = `Converting to ASCII: ${progress.current}/${progress.total}`;
                    break;
                case 'encoding':
                    progressText.textContent = `Encoding MP4: ${progress.current || ''}/${progress.total || ''}`;
                    break;
                case 'complete':
                    progressText.textContent = 'Complete!';
                    break;
            }
        };
    }

    convertMp4Btn.addEventListener('click', async () => {
        const options = getOptions();
        if (!validateOptions(options)) return;

        convertMp4Btn.disabled = true;
        convertTextBtn.disabled = true;
        convertSvgBtn.disabled = true;
        showProgress();

        try {
            const converter = new VideoToAsciiConverter({
                asciiChars: options.chars,
                noiseLevel: options.noiseLevel,
                whiteThreshold: options.threshold,
                contrast: options.contrast,
                exposure: options.exposure,
                onProgress: createProgressHandler()
            });

            const result = await converter.convertToMp4(videoInput.files[0], {
                fps: options.fps,
                asciiWidth: options.width,
                skipStartFrames: options.skipStartFrames,
                skipEndFrames: options.skipEndFrames
            });

            currentMp4Result = result;

            progressDiv.classList.add('hidden');
            resultMp4Div.classList.remove('hidden');

            const videoUrl = URL.createObjectURL(result.blob);
            outputVideo.src = videoUrl;

            downloadMp4Btn.textContent = result.format === 'mp4' ? 'Download MP4' : 'Download WebM';

        } catch (err) {
            console.error('Conversion error:', err);
            progressDiv.classList.add('hidden');
            errorDiv.classList.remove('hidden');
            errorMessage.textContent = err.message || 'Unknown error occurred';
        } finally {
            convertMp4Btn.disabled = false;
            convertTextBtn.disabled = false;
            convertSvgBtn.disabled = false;
        }
    });

    async function convertToText() {
        const options = getOptions();
        if (!validateOptions(options)) return;

        convertTextBtn.disabled = true;
        convertMp4Btn.disabled = true;
        convertSvgBtn.disabled = true;
        showProgress();

        try {
            const converter = new VideoToAsciiConverter({
                asciiChars: options.chars,
                noiseLevel: options.noiseLevel,
                whiteThreshold: options.threshold,
                contrast: options.contrast,
                exposure: options.exposure,
                onProgress: createProgressHandler()
            });

            const result = await converter.convertToText(videoInput.files[0], {
                fps: options.fps,
                asciiWidth: options.width,
                skipStartFrames: options.skipStartFrames,
                skipEndFrames: options.skipEndFrames
            });

            currentTextResult = result;

            progressDiv.classList.add('hidden');

            // Auto download and save to storage
            await downloadTextFile(result);

        } catch (err) {
            console.error('Conversion error:', err);
            progressDiv.classList.add('hidden');
            errorDiv.classList.remove('hidden');
            errorMessage.textContent = err.message || 'Unknown error occurred';
        } finally {
            convertTextBtn.disabled = false;
            convertMp4Btn.disabled = false;
            convertSvgBtn.disabled = false;
        }
    }

    convertTextBtn.addEventListener('click', convertToText);

    // SVG (.neil format) conversion
    convertSvgBtn.addEventListener('click', async () => {
        const options = getOptions();
        if (!validateOptions(options)) return;

        convertMp4Btn.disabled = true;
        convertTextBtn.disabled = true;
        convertSvgBtn.disabled = true;
        showProgress();

        try {
            const converter = new VideoToAsciiConverter({
                asciiChars: options.chars,
                noiseLevel: options.noiseLevel,
                whiteThreshold: options.threshold,
                contrast: options.contrast,
                exposure: options.exposure,
                maskedPixels: options.maskedPixels,
                onProgress: createProgressHandler()
            });

            const result = await converter.convertToBinaryRGB(videoInput.files[0], {
                fps: options.fps,
                asciiWidth: options.width,
                skipStartFrames: options.skipStartFrames,
                skipEndFrames: options.skipEndFrames
            });

            progressDiv.classList.add('hidden');

            // Download .neil files
            await downloadNeilFiles(result);

        } catch (err) {
            console.error('Conversion error:', err);
            progressDiv.classList.add('hidden');
            errorDiv.classList.remove('hidden');
            errorMessage.textContent = err.message || 'Unknown error occurred';
        } finally {
            convertMp4Btn.disabled = false;
            convertTextBtn.disabled = false;
            convertSvgBtn.disabled = false;
        }
    });

    async function downloadNeilFiles(result) {
        const baseName = currentVideoFileName || 'video';

        // Create metadata JSON (matching neiltthomas.com format)
        const metadata = {
            width: result.width,
            height: result.height,
            fps: result.fps,
            frameCount: result.frameCount,
            format: 'delta'
        };

        const metadataJson = JSON.stringify(metadata);
        const metadataBlob = new Blob([metadataJson], { type: 'application/json' });

        // Apply delta encoding: first frame is raw, subsequent frames are XOR with previous
        const bytesPerFrame = result.width * result.height * 3;
        const totalBytes = result.rgbFrames.length * bytesPerFrame;
        const deltaData = new Uint8Array(totalBytes);

        // First frame is stored as-is
        deltaData.set(result.rgbFrames[0], 0);

        // Subsequent frames are XOR'd with previous frame
        for (let f = 1; f < result.rgbFrames.length; f++) {
            const currFrame = result.rgbFrames[f];
            const prevFrame = result.rgbFrames[f - 1];
            const offset = f * bytesPerFrame;

            for (let i = 0; i < bytesPerFrame; i++) {
                deltaData[offset + i] = currFrame[i] ^ prevFrame[i];
            }
        }

        // Compress the delta-encoded data with gzip
        const binaryBlob = new Blob([deltaData]);
        const compressedStream = binaryBlob.stream().pipeThrough(new CompressionStream('gzip'));
        const compressedBlob = await new Response(compressedStream).blob();

        // Download metadata JSON
        const metadataUrl = URL.createObjectURL(metadataBlob);
        const metadataLink = document.createElement('a');
        metadataLink.href = metadataUrl;
        metadataLink.download = `${baseName}.meta.json`;
        document.body.appendChild(metadataLink);
        metadataLink.click();
        document.body.removeChild(metadataLink);
        URL.revokeObjectURL(metadataUrl);

        // Delay to ensure both downloads trigger
        await new Promise(resolve => setTimeout(resolve, 500));

        // Download compressed binary as .neil file
        const binaryUrl = URL.createObjectURL(compressedBlob);
        const binaryLink = document.createElement('a');
        binaryLink.href = binaryUrl;
        binaryLink.download = `${baseName}.neil`;
        document.body.appendChild(binaryLink);
        binaryLink.click();
        document.body.removeChild(binaryLink);
        URL.revokeObjectURL(binaryUrl);

        // Delay before first frame download
        await new Promise(resolve => setTimeout(resolve, 500));

        // Download first frame separately (for SSR placeholder)
        const firstFrameBlob = new Blob([result.rgbFrames[0]]);
        const firstFrameCompressed = firstFrameBlob.stream().pipeThrough(new CompressionStream('gzip'));
        const firstFrameGz = await new Response(firstFrameCompressed).blob();

        const firstFrameUrl = URL.createObjectURL(firstFrameGz);
        const firstFrameLink = document.createElement('a');
        firstFrameLink.href = firstFrameUrl;
        firstFrameLink.download = `${baseName}.first.neil`;
        document.body.appendChild(firstFrameLink);
        firstFrameLink.click();
        document.body.removeChild(firstFrameLink);
        URL.revokeObjectURL(firstFrameUrl);
    }

    downloadMp4Btn.addEventListener('click', () => {
        if (!currentMp4Result) return;

        const url = URL.createObjectURL(currentMp4Result.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = currentMp4Result.format === 'mp4' ? 'ascii-video.mp4' : 'ascii-video.webm';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    function rleEncodeFrame(frame) {
        const flat = frame.flat();
        const encoded = [];
        let i = 0;
        while (i < flat.length) {
            const pixel = flat[i];
            let count = 1;
            while (i + count < flat.length && JSON.stringify(flat[i + count]) === JSON.stringify(pixel)) {
                count++;
            }
            if (count > 1) {
                encoded.push([count, pixel]);
            } else {
                encoded.push(pixel);
            }
            i += count;
        }
        return encoded;
    }

    async function downloadTextFile(result) {
        const lines = [];

        lines.push(JSON.stringify({
            fps: result.fps,
            width: result.asciiWidth,
            height: result.asciiHeight,
            frameCount: result.textFrames.length,
            duration: result.duration,
            rle: true
        }));

        for (const frame of result.textFrames) {
            lines.push(JSON.stringify(rleEncodeFrame(frame)));
        }

        const jsonlString = lines.join('\n');

        // Compress using CompressionStream
        const blob = new Blob([jsonlString]);
        const compressedStream = blob.stream().pipeThrough(new CompressionStream('gzip'));
        const compressedBlob = await new Response(compressedStream).blob();

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const baseName = currentVideoFileName || 'ascii-video';
        const filename = `${baseName}-${timestamp}.jsonl.gz`;

        // Download the file
        const url = URL.createObjectURL(compressedBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    downloadTextBtn.addEventListener('click', () => {
        if (!currentTextResult) return;
        downloadTextFile(currentTextResult);
    });
});
