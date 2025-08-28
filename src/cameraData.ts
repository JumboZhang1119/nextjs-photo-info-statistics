// src/cameraData.ts

// Define a mapping of camera models to their crop factors
export type CropFactorMap = {
    [model: string]: number;
  };
  export const defaultCropFactors: CropFactorMap = {
    // --- Sony ---
    'ILCE-7M4': 1.0,    // Sony α7 IV
    'ILCE-7RM5': 1.0,   // Sony α7R V
    'ILCE-7CM2': 1.0,   // Sony α7C II
    'ILCE-9M3': 1.0,    // Sony α9 III
    'ILCE-1': 1.0,      // Sony α1
    'ILCE-6700': 1.5,   // Sony α6700
    'ILCE-6400': 1.5,   // Sony α6400
    'ZV-E1': 1.0,       // Sony ZV-E1
    'ZV-E10': 1.5,      // Sony ZV-E10

    // --- Nikon ---
    'NIKON Z 8': 1.0,
    'NIKON Z 9': 1.0,
    'NIKON Z 6_2': 1.0,       // Nikon Z6 II
    'NIKON Z 7_2': 1.0,       // Nikon Z7 II
    'NIKON Z f': 1.0,
    'NIKON Z 5': 1.0,
    'NIKON Z fc': 1.5,
    'NIKON Z 30': 1.5,
    'NIKON Z 50': 1.5,
    'NIKON D850': 1.0,
    'NIKON D7500': 1.5,
    'NIKON D7100': 1.5,

    // --- Canon ---
    'Canon EOS R5': 1.0,
    'Canon EOS R6 Mark II': 1.0,
    'Canon EOS R7': 1.6,
    'Canon EOS R8': 1.0,
    'Canon EOS R10': 1.6,
    'Canon EOS R50': 1.6,
    'Canon EOS M6': 1.6,
    'Canon EOS M6 Mark II': 1.6, 
    'Canon EOS 6D': 1.0,
    'Canon EOS 6D Mark II': 1.0,
    'Canon EOS 90D': 1.6,
    
    // --- FUJIFILM ---
    'X-T5': 1.5,
    'X-H2': 1.5,
    'X-H2S': 1.5,
    'X-S20': 1.5,
    'X100VI': 1.5,
    'GFX100S': 0.79,
  };