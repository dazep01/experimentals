/**
 * @file src/workers/ai_inference.worker.ts
 * @description Web Worker untuk inferensi parameter GCam menggunakan ONNX Runtime WebGL.
 */
import * as ort from 'onnxruntime-web';

// Konfigurasi session ONNX untuk performa maksimal di browser
const SESSION_OPTIONS: ort.InferenceSession.SessionOptions = {
  executionProviders: ['webgl'], // Menggunakan WebGL untuk akselerasi GPU
  graphOptimizationLevel: 'all',
  enableMemPattern: true,
};

let session: ort.InferenceSession | null = null;

// Inisialisasi model saat worker dimulai
async function initModel() {
  try {
    // Memuat model dari folder public/models
    session = await ort.InferenceSession.create('/models/soc_mapper.onnx', SESSION_OPTIONS);
    self.postMessage({ type: 'INIT_SUCCESS', message: 'AI Model loaded with WebGL backend' });
  } catch (e) {
    self.postMessage({ type: 'INIT_ERROR', error: e.message });
  }
}

// Fungsi pemetaan input Chipset ke Tensor
function prepareInput(socName: string): Float32Array {
  // Simulasi encoding: Qualcomm=0, MediaTek=1, Exynos=2
  const mapping: Record<string, number> = { 'qualcomm': 0, 'mediatek': 1, 'exynos': 2 };
  const val = mapping[socName] || 0;
  return new Float32Array([val]); 
}

self.onmessage = async (e) => {
  if (e.data.type === 'INIT') {
    await initModel();
  }

  if (e.data.type === 'PREDICT' && session) {
    const { soc } = e.data;
    
    // 1. Siapkan Tensor Input
    const inputTensor = new ort.Tensor('float32', prepareInput(soc), [1, 1]);
    
    // 2. Jalankan Inferensi (GPU Accelerated)
    const feeds = { input: inputTensor };
    const results = await session.run(feeds);
    
    // 3. Ambil hasil (Output berupa array float: [denoise, sharp, sabre, ...])
    const outputData = Array.from(results.output.data as Float32Array);
    
    self.postMessage({ 
      type: 'PREDICTION_RESULT', 
      params: {
        spatialDenoise: outputData[0],
        sharpRadius: outputData[1],
        sabreDetail: Math.round(outputData[2]), // Sabre biasanya integer
        saturation: outputData[3]
      }
    });
  }
};