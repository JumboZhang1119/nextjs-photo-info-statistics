// src/App.tsx
import { useState, useMemo } from 'react';
import exifr from 'exifr';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import './App.css';

// 註冊 Chart.js 需要的元件
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

// 擴充後的 EXIF 資料結構
interface ExifData {
  Make?: string;
  Model?: string;
  LensModel?: string;
  ExposureTime?: number;
  FNumber?: number;
  ISOSpeedRatings?: number;
  DateTimeOriginal?: Date;
  FocalLength?: number;
  FocalLengthIn35mmFormat?: number;
}

// 照片的完整資料結構
interface PhotoData {
  id: string;
  source: 'local' | 'synology';
  filename: string;
  exif: ExifData;
}

// 圖表資料的結構
interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor: string[];
    borderColor: string[];
    borderWidth: number;
  }[];
}


function App() {
  // --- 現有狀態 ---
  const [localPhotos, setLocalPhotos] = useState<PhotoData[]>([]);
  const [synoPhotos, setSynoPhotos] = useState<PhotoData[]>([]); // Synology 的部分先保持結構一致
  // ... (Synology 相關狀態)
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // --- 新增的狀態 ---
  // 1. 統計設定
  const [groupBy, setGroupBy] = useState<keyof ExifData>('Model'); // 預設依據相機型號統計
  const [focalLengthRanges, setFocalLengthRanges] = useState('1-35, 36-70, 71-200, 201-800'); // 焦段區間設定

  // 2. 篩選器狀態
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedLenses, setSelectedLenses] = useState<string[]>([]);
  
  // 3. 圖表資料
  const [chartData, setChartData] = useState<ChartData | null>(null);

  // --- 資料處理 ---

  // 使用 useMemo 合併本地與 Synology 的照片，避免不必要的重複計算
  const allPhotos = useMemo(() => [...localPhotos, ...synoPhotos], [localPhotos, synoPhotos]);

  // 使用 useMemo 動態產生篩選選項
  const availableModels = useMemo(() => {
    const models = new Set(allPhotos.map(p => p.exif.Model).filter(Boolean));
    return Array.from(models) as string[];
  }, [allPhotos]);

  const availableLenses = useMemo(() => {
    const lenses = new Set(allPhotos.map(p => p.exif.LensModel).filter(Boolean));
    return Array.from(lenses) as string[];
  }, [allPhotos]);


  // --- 函式 ---
  
  const handleLocalFolderSelect = async () => {
    // ... (您現有的邏輯，但要修改輸出格式)
    setError('');
    setLocalPhotos([]); // 改成 setLocalPhotos
    setIsLoading(true);
    try {
        // @ts-ignore
        const dirHandle = await window.showDirectoryPicker();
        const photoResults: PhotoData[] = [];

        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file' && (entry.name.toLowerCase().endsWith('.jpg') || entry.name.toLowerCase().endsWith('.jpeg') || entry.name.toLowerCase().endsWith('.heic') || entry.name.toLowerCase().endsWith('.cr3') || entry.name.toLowerCase().endsWith('.arw'))) {
                const file = await entry.getFile();
                try {
                    const exifObj = await exifr.parse(file);
                    let processedExif: ExifData = {};
                    if (exifObj) {
                        processedExif = {
                            Make: exifObj.Make,
                            Model: exifObj.Model,
                            LensModel: exifObj.LensModel,
                            ExposureTime: exifObj.ExposureTime,
                            FNumber: exifObj.FNumber,
                            ISOSpeedRatings: exifObj.ISOSpeedRatings,
                            DateTimeOriginal: exifObj.DateTimeOriginal,
                            FocalLength: exifObj.FocalLength,
                            FocalLengthIn35mmFormat: exifObj.FocalLengthIn35mmFormat,
                        };
                    }
                    photoResults.push({
                      id: `local-${file.name}-${file.lastModified}`,
                      source: 'local',
                      filename: file.name,
                      exif: processedExif
                    });
                } catch (e) {
                    console.warn(`無法解析檔案 ${file.name} 的 EXIF`, e);
                }
            }
        }
        setLocalPhotos(photoResults); // 改成 setLocalPhotos
    } catch (e) {
        console.error(e);
        setError('讀取本地資料夾失敗。');
    } finally {
        setIsLoading(false);
    }
  };

  // 處理圖表生成
  const handleGenerateChart = () => {
    // 1. 篩選照片
    const filteredPhotos = allPhotos.filter(photo => {
      const { exif } = photo;
      // 如果有選擇相機型號，但照片不符合，則過濾掉
      if (selectedModels.length > 0 && !selectedModels.includes(exif.Model || '')) {
        return false;
      }
      // 如果有選擇鏡頭型號，但照片不符合，則過濾掉
      if (selectedLenses.length > 0 && !selectedLenses.includes(exif.LensModel || '')) {
        return false;
      }
      // 可以繼續增加其他篩選條件，例如光圈、ISO...
      return true;
    });

    // 2. 根據 groupBy 統計資料
    const counts: { [key: string]: number } = {};

    if (groupBy === 'FocalLength') {
      // **特殊處理：焦段區間統計**
      const ranges = focalLengthRanges.split(',').map(r => {
        const [min, max] = r.trim().split('-').map(Number);
        return { label: `${min}-${max}mm`, min, max };
      });
      const rangeLabels = ranges.map(r => r.label);
      rangeLabels.forEach(l => counts[l] = 0); // 初始化
      counts['其他'] = 0; // 未落入區間的

      filteredPhotos.forEach(photo => {
        const focalLength = photo.exif.FocalLength;
        if (typeof focalLength === 'number') {
          const foundRange = ranges.find(r => focalLength >= r.min && focalLength <= r.max);
          if (foundRange) {
            counts[foundRange.label]++;
          } else {
            counts['其他']++;
          }
        }
      });
      // 移除沒有照片的 "其他" 項目
      if(counts['其他'] === 0) delete counts['其他'];

    } else {
      // **通用處理：根據屬性值統計**
      filteredPhotos.forEach(photo => {
        const key = (photo.exif[groupBy] as string) || '未知'; // 取得要統計的屬性值
        counts[key] = (counts[key] || 0) + 1;
      });
    }

    // 3. 轉換為 Chart.js 的資料格式
    const labels = Object.keys(counts).sort((a, b) => counts[b] - counts[a]); // 依照數量排序
    const data = labels.map(label => counts[label]);

    // 產生隨機顏色
    const colors = data.map(() => `rgba(${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, 0.6)`);

    setChartData({
      labels,
      datasets: [
        {
          label: `依 ${groupBy} 統計的照片張數`,
          data,
          backgroundColor: colors,
          borderColor: colors.map(c => c.replace('0.6', '1')),
          borderWidth: 1,
        },
      ],
    });
  };

  // --- JSX 渲染 ---
  return (
    <div className="container">
      <h1>照片 EXIF 資訊統計器</h1>
      {error && <p className="error-message">{error}</p>}
      {isLoading && <p className="loading-message">讀取中，請稍候...</p>}
      
      {/* --- 資料來源選擇 --- */}
      <div className="card-row">
        <div className="card">
          <h2>1. 讀取本地資料夾</h2>
          <button onClick={handleLocalFolderSelect} disabled={isLoading}>
            選擇本地資料夾
          </button>
        </div>
        <div className="card">
          {/* Synology 的 UI 放在這裡 */}
          <h2>(未來) 讀取 Synology Photos</h2>
        </div>
      </div>

      {allPhotos.length > 0 && (
        <>
        {/* --- 分析與統計區塊 --- */}
        <div className="card">
            <h2>📊 分析與統計 (共 {allPhotos.length} 張照片)</h2>
            <div className="form-grid">
              {/* 統計依據 */}
              <div className="form-group">
                <label>統計依據:</label>
                <select value={groupBy} onChange={e => setGroupBy(e.target.value as keyof ExifData)}>
                  <option value="Model">相機型號 (Camera Model)</option>
                  <option value="LensModel">鏡頭型號 (Lens Model)</option>
                  <option value="FocalLength">焦段 (Focal Length)</option>
                  <option value="Make">相機廠牌 (Make)</option>
                  <option value="FNumber">光圈 (F-Number)</option>
                  {/* 可以繼續增加 */}
                </select>
              </div>

              {/* 焦段區間設定 (只有在依焦段統計時顯示) */}
              {groupBy === 'FocalLength' && (
                <div className="form-group">
                  <label>焦段區間 (以逗號分隔):</label>
                  <input 
                    type="text" 
                    value={focalLengthRanges} 
                    onChange={e => setFocalLengthRanges(e.target.value)}
                    placeholder="例如: 1-35,36-70,71-200"
                  />
                </div>
              )}
            </div>

            {/* 篩選器 */}
            <h3>篩選條件</h3>
            <div className="form-grid">
               <div className="form-group checkbox-group">
                  <label>相機型號:</label>
                  {availableModels.map(model => (
                    <label key={model}>
                      <input type="checkbox" value={model} checked={selectedModels.includes(model)}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedModels([...selectedModels, model]);
                          } else {
                            setSelectedModels(selectedModels.filter(m => m !== model));
                          }
                        }}
                      /> {model}
                    </label>
                  ))}
               </div>
               <div className="form-group checkbox-group">
                  <label>鏡頭型號:</label>
                  {availableLenses.map(lens => (
                    <label key={lens}>
                      <input type="checkbox" value={lens} checked={selectedLenses.includes(lens)}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedLenses([...selectedLenses, lens]);
                          } else {
                            setSelectedLenses(selectedLenses.filter(l => l !== lens));
                          }
                        }}
                      /> {lens}
                    </label>
                  ))}
               </div>
            </div>

            <button onClick={handleGenerateChart} className="generate-button">
              生成統計圖表
            </button>
        </div>

        {/* --- 圖表顯示區塊 --- */}
        {chartData && (
          <div className="card chart-container">
            <h3>統計結果</h3>
            <Bar data={chartData} options={{ responsive: true, plugins: { legend: { display: false }, title: { display: true, text: chartData.datasets[0].label }}}} />
          </div>
        )}
        </>
      )}

      {/* --- 原始資料預覽 (可選) --- */}
      {/* {allPhotos.length > 0 && (
        <div className="card">
          <h2>原始 EXIF 結果預覽</h2>
          <pre>{JSON.stringify(allPhotos.slice(0, 5), null, 2)}</pre>
        </div>
      )} 
      */}
    </div>
  );
}

export default App;


  // // 處理 Synology 連線
  // const handleSynologyFetch = async () => {
  //   setError('');
  //   setSynoPhotos([]);
  //   setIsLoading(true);
  //   let sidToUse = synoSessionId;

  //   try {
  //     // 步驟一：如果沒有 Session ID，先進行登入
  //     if (!sidToUse) {
  //       const loginResponse = await fetch('/api/synology-login', {
  //         method: 'POST',
  //         headers: { 'Content-Type': 'application/json' },
  //         body: JSON.stringify({
  //           host: synoHost,
  //           account: synoAccount,
  //           password: synoPassword,
  //         }),
  //       });

  //       const loginData = await loginResponse.json();

  //       if (!loginResponse.ok) {
  //         throw new Error(loginData.message || `登入失敗，狀態碼: ${loginResponse.status}`);
  //       }
        
  //       sidToUse = loginData.sid;
  //       setSynoSessionId(sidToUse); // 儲存 Session ID
  //     }

  //     // 步驟二：使用 Session ID 直接向 Synology 請求資料
  //     const synoPhotosUrl = `${synoHost}/photo/webapi/entry.cgi?api=SYNO.PhotoStation.Photo&method=list&version=1&album_id=${synoAlbumId}&sid=${sidToUse}`;
      
  //     // 這裡我們直接向 Synology 發出請求，流量不會經過 Vercel
  //     const response = await fetch(synoPhotosUrl);
      
  //     if (!response.ok) {
  //       // 如果 Session ID 失效，需要重新登入
  //       if (response.status === 401) {
  //         setSynoSessionId(null); // 清除失效的 Session ID
  //         throw new Error('連線已過期，請重新嘗試。');

  //         // console.warn('Session ID 已過期，正在嘗試重新登入...');
  //         // const newSid = await getSessionId(true); // 傳入參數強制重新登入
  //         // response = await fetch(`${synoPhotosUrl}&sid=${newSid}`); // 用新的 SID 再次請求
  //       }
  //       throw new Error(`從 Synology 取得資料失敗，狀態碼: ${response.status}`);
  //     }

  //     const data: any = await response.json();

  //     if (!data.success) {
  //       throw new Error(data.error?.message || '從 Synology 取得資料失敗。');
  //     }

  //     const processedPhotos = data.data.list.map((photo: any) => {
  //       const rawExif = photo.additional?.exif || {};
  //       const processedExif: ExifData = {
  //         Make: rawExif.Make,
  //         Model: rawExif.Model,
  //         LensModel: rawExif.LensModel, // 新增 LensModel
  //         ExposureTime: rawExif.ExposureTime,
  //         FNumber: rawExif.FNumber,
  //         ISOSpeedRatings: rawExif.ISOSpeedRatings,
  //         DateTimeOriginal: rawExif.DateTimeOriginal,
  //         FocalLength: rawExif.FocalLength,
  //         FocalLengthIn35mmFormat: rawExif.FocalLengthIn35mmFormat,
  //         };
  //       return {
  //         filename: photo.filename,
  //         exif: processedExif,
  //       };
  //     });

  //     setSynoPhotos(processedPhotos);

  //   } catch (e) {
  //     console.error(e);
  //     setError(e instanceof Error ? e.message : '發生未知錯誤。');
  //   } finally {
  //     setIsLoading(false);
  //   }
  // };

  // // 為了在網頁關閉時自動登出，我們可以使用 useEffect
  // useEffect(() => {
  //     // 確保登出函式能拿到最新的狀態
  //     const logoutOnUnmount = () => {
  //         if (synoSessionId && synoHost) {
  //             fetch('/api/synology-logout', {
  //                 method: 'POST',
  //                 headers: { 'Content-Type': 'application/json' },
  //                 body: JSON.stringify({ host: synoHost, sid: synoSessionId }),
  //             }).then(() => {
  //                 console.log('已登出 Synology。');
  //             }).catch(e => {
  //                 console.error('登出失敗:', e);
  //             }).finally(() => {
  //                 // 不論成功或失敗，都清除狀態
  //                 setSynoSessionId(null);
  //             });
  //         }
  //     };
      
  //     // 在元件卸載時執行登出
  //     return () => {
  //         logoutOnUnmount();
  //     };
  // }, [synoSessionId, synoHost]); // 將相關狀態加入依賴項