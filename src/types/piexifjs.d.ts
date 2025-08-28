// piexifjs.d.ts
declare module 'piexifjs' {
    const piexif: {
      // Define the structure of EXIF data
      ImageIFD: {
        Make: number;
        Model: number;
      };
      ExifIFD: {
        ExposureTime: number;
        FNumber: number;
        ISOSpeedRatings: number;
        DateTimeOriginal: number;
        FocalLength: number;
        FocalLengthIn35mmFormat: number;
      };
      load: (jpegData: string) => any;
      dump: (exifObj: any) => string;
      insert: (exifStr: string, jpegData: string) => string;
    };
    export default piexif;
  }
  