/**
 * @file src/ui/app.ts
 * @description Menghubungkan UI dengan AI Worker dan XML Serializer.
 */
import { XmlSerializer } from '../core/xml_serializer';

const worker = new Worker(new URL('../workers/ai_inference.worker.ts', import.meta.url));

// Inisialisasi Worker
worker.postMessage({ type: 'INIT' });

export function handleGenerateConfig(soc: string, variant: 'lmc' | 'bsg') {
  worker.postMessage({ type: 'PREDICT', soc });

  worker.onmessage = (e) => {
    if (e.data.type === 'PREDICTION_RESULT') {
      const params = e.data.params;
      
      // Konversi hasil AI ke format yang dimengerti Serializer
      const configProfile = {
        libPatcher: {
          spatialDenoise: params.spatialDenoise,
          chromaDenoise: params.spatialDenoise * 1.1, // Heuristik sederhana
          sharpRadiusSmall: params.sharpRadius,
          sabreDetail: params.sabreDetail,
          saturationLevel: params.saturation
        },
        developerSettings: {
          viewfinderFormat: soc === 'qualcomm' ? 'RAW16' : 'YUV_420_888',
          rawFormat: 'RAW10',
          enableSabre: params.sabreDetail > 0,
          packageSpoof: soc === 'exynos' ? 'com.samsung.android.scan3d' : 'org.codeaurora.snapcam'
        },
        awbMatrix: { rgGain: [], bgGain: [] } // Akan diisi oleh model AWB terpisah nanti
      };

      // Generate dan Download XML
      const serializer = new XmlSerializer(configProfile, variant);
      const blob = serializer.exportXml(`${variant}_${soc}_ai_config.xml`);
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${variant}_${soc}_ai_config.xml`;
      a.click();
    }
  };
}