// piexifjs.d.ts
declare module 'piexifjs' {
    const piexif: {
      ImageIFD: {
        Make: number;
        Model: number;
        // 你用到的其他欄位也補上
      };
      ExifIFD: {
        ExposureTime: number;
        FNumber: number;
        ISOSpeedRatings: number;
        DateTimeOriginal: number;
        FocalLength: number;
        FocalLengthIn35mmFormat: number;
        // 其他你會用到的欄位
      };
      // 其他方法和屬性，可以用 any 代替
      load: (jpegData: string) => any;
      dump: (exifObj: any) => string;
      insert: (exifStr: string, jpegData: string) => string;
    };
    export default piexif;
  }
  