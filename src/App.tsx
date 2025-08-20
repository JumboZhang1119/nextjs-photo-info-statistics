// src/App.tsx
import { useState, useMemo, useEffect } from 'react';
import exifr from 'exifr';
import { Bar } from 'react-chartjs-2';
import { Sidebar } from './components/Sidebar';
import { defaultCropFactors, type CropFactorMap } from './cameraData'; 
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
// import { FilterSidebar } from './components/FilterSidebar';
import './App.css';

// 註冊 Chart.js 需要的元件
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ChartDataLabels
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

type ParsedRange = {
  label: string;
  type: string;
  test: (fl: number) => boolean;
};

// 照片的完整資料結構
interface PhotoData {
  id: string;
  source: 'local' | 'synology';
  filename: string;
  exif: ExifData;
  folderPath: string; // e.g., "旅遊照片/2024-日本"
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
  // const [synoPhotos, setSynoPhotos] = useState<PhotoData[]>([]); // Synology 的部分先保持結構一致
  // ... (Synology 相關狀態)
  const [progress, setProgress] = useState({
    loading: false, // 是否正在讀取
    total: 0,       // 總檔案數
    processed: 0,   // 已處理檔案數
    message: '',    // 顯示的訊息
  });
  const [error, setError] = useState('');

  // --- 新增的狀態 ---
  // 1. 統計設定
  const [groupBy, setGroupBy] = useState<keyof ExifData>('Model'); // 預設依據相機型號統計
  const [focalLengthMode, setFocalLengthMode] = useState<'range' | 'continuous'>('range'); 
  const [focalLengthRanges, setFocalLengthRanges] = useState('14-23, 24-70, 70-200, other'); // 焦段區間設定

  // 2. 篩選器狀態
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedLenses, setSelectedLenses] = useState<string[]>([]);

  // [新增] 資料夾篩選相關狀態
  const [allFolderPaths, setAllFolderPaths] = useState<string[]>([]); // 儲存所有讀取到的資料夾路徑
  const [selectedFolderPaths, setSelectedFolderPaths] = useState<string[]>([]); // 儲存使用者勾選要分析的資料夾
  
  // 3. 圖表資料
  const [chartData, setChartData] = useState<ChartData | null>(null);

  const [isSidebarOpen, setSidebarOpen] = useState(false);

  const [topFocalLengthLabels, setTopFocalLengthLabels] = useState<string[]>([]);

  const [cropFactors, setCropFactors] = useState<CropFactorMap>(defaultCropFactors);

  const [debouncedFocalLengthRanges, setDebouncedFocalLengthRanges] = useState(focalLengthRanges);

  const GROUP_BY_LABELS: { [key: string]: string } = {
    Model: '相機型號',
    LensModel: '鏡頭型號',
    FocalLength: '等效焦段',
    // 如果未來新增其他統計依據，也一併加到這裡
    // Make: '相機廠牌',
    // FNumber: '光圈值',
  };


  // --- 資料處理 ---

  // 使用 useMemo 合併本地與 Synology 的照片，避免不必要的重複計算
  const allPhotos = useMemo(() => [...localPhotos], [localPhotos]);

  // 使用 useMemo 動態產生篩選選項
  const availableModels = useMemo(() => {
    const models = new Set(allPhotos.map(p => p.exif.Model).filter(Boolean));
    return Array.from(models).sort() as string[];
  }, [allPhotos]);

  const availableLenses = useMemo(() => {
    const lenses = new Set(allPhotos.map(p => p.exif.LensModel).filter(Boolean));
    return Array.from(lenses).sort() as string[];
  }, [allPhotos]);

  // 效果一：當可用的相機型號列表更新時，自動將所有型號設定為「已選取」
  useEffect(() => {
    setSelectedModels(availableModels);
  }, [availableModels]);

  // 效果二：當可用的鏡頭型號列表更新時，自動將所有鏡頭設定為「已選取」
  useEffect(() => {
    setSelectedLenses(availableLenses);
  }, [availableLenses]);

  useEffect(() => {
    // 設定一個計時器
    const timer = setTimeout(() => {
      // 500ms 後，將輸入框的即時值，同步到 "debounced" state 中
      setDebouncedFocalLengthRanges(focalLengthRanges);
    }, 800); // 延遲 500 毫秒

    // 清除函式：在下一次 effect 執行前 (即使用者又輸入新字元時)，清除上一個計時器
    return () => {
      clearTimeout(timer);
    };
  }, [focalLengthRanges]);

  useEffect(() => {
    // 只有當有照片時才自動生成圖表，避免初始渲染時執行
    if (allPhotos.length > 0) {
      console.log("偵測到依賴項變更，自動生成圖表..."); // for debugging
      handleGenerateChart();
    }
  }, [
    // 在這裡列出所有會影響圖表結果的"依賴項"
    groupBy,              // 統計依據
    focalLengthMode,      // 焦段統計模式
    debouncedFocalLengthRanges,
    selectedModels,       // 已選相機型號
    selectedLenses,       // 已選鏡頭型號
    selectedFolderPaths,  // 已選資料夾
    cropFactors,          // 等效焦段倍率設定
    allPhotos             // 當照片本身更新時 (例如讀取新資料夾)
  ]);

  // --- 函式 ---

  // [Request 1] 更新等效焦段倍率的函式
  const handleCropFactorChange = (model: string, factorStr: string) => {
    const factor = parseFloat(factorStr);
    setCropFactors(prev => ({
      ...prev,
      [model]: isNaN(factor) || factor <= 0 ? 1.0 : factor,
    }));
  };

  const countFiles = async (dirHandle: FileSystemDirectoryHandle): Promise<number> => {
    let count = 0;
    const imageRegex = /\.(jpe?g|heic|cr3|arw)$/i;
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file' && imageRegex.test(entry.name)) {
        count++;
      } else if (entry.kind === 'directory') {
        count += await countFiles(entry); // 遞迴計數子資料夾
      }
    }
    return count;
  };

  // [新增] 遞迴讀取資料夾內容的輔助函式
  const processDirectory = async (dirHandle: FileSystemDirectoryHandle, currentPath: string, onProgress: () => void): Promise<PhotoData[]> => {
    const photoResults: PhotoData[] = [];
    const imageRegex = /\.(jpe?g|heic|cr3|arw)$/i; // 簡化判斷式

    for await (const entry of dirHandle.values()) {
      const entryPath = `${currentPath}/${entry.name}`;
      if (entry.kind === 'file' && imageRegex.test(entry.name)) {
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
            exif: processedExif,
            folderPath: currentPath, // [修改] 記錄檔案所在的資料夾路徑
          });
        } catch (e) {
          console.warn(`無法解析檔案 ${file.name} 的 EXIF`, e);
        } finally {
          onProgress();
        }
      } else if (entry.kind === 'directory') {
        // 如果是資料夾，就遞迴呼叫自己，並將結果合併
        const subFolderPhotos = await processDirectory(entry, entryPath, onProgress);
        photoResults.push(...subFolderPhotos);
      }
    }
    return photoResults;
  };
  
  // [最終版本] 包含進度條與照片合併功能的完整函式
  const handleLocalFolderSelect = async () => {
    setError('');
    
    try {
      // @ts-ignore
      const dirHandle = await window.showDirectoryPicker();
      
      // --- 開始進度流程 ---
      // 1. 進入讀取狀態，顯示計數訊息
      setProgress({ loading: true, processed: 0, total: 0, message: '正在掃描檔案總數...' });

      // 2. 執行第一步：快速計數
      const totalFiles = await countFiles(dirHandle);
      
      if (totalFiles === 0) {
        setError('在選擇的資料夾及其子資料夾中沒有找到符合條件的照片檔案。');
        setProgress({ loading: false, processed: 0, total: 0, message: '' });
        return;
      }
      
      // 3. 更新狀態，顯示處理訊息和總數
      setProgress({ loading: true, processed: 0, total: totalFiles, message: '正在解析照片 EXIF 資訊...' });
      
      // 4. 定義進度回報函式
      const onProgressUpdate = () => {
        // 使用函式形式更新 state，避免閉包問題
        setProgress(prev => ({ ...prev, processed: prev.processed + 1 }));
      };

      // 5. 執行第二步：處理檔案，並傳入進度回報函式
      const newPhotos = await processDirectory(dirHandle, dirHandle.name, onProgressUpdate);

      // --- 6. 處理完成，合併新舊照片 ---
      // 這裡就是您原本的合併邏輯，它被完整地保留了下來
      setLocalPhotos(prevPhotos => {
        // 簡單的去重邏輯，避免重複加入相同的照片
        const existingIds = new Set(prevPhotos.map(p => p.id));
        const uniqueNewPhotos = newPhotos.filter(p => !existingIds.has(p.id));
        const combinedPhotos = [...prevPhotos, ...uniqueNewPhotos];

        // 從合併後的照片中，提取出所有不重複的資料夾路徑
        const allPaths = Array.from(new Set(combinedPhotos.map(p => p.folderPath))).sort();
        setAllFolderPaths(allPaths);

        // 預設將新加入的資料夾路徑也加入篩選列表
        const newPaths = Array.from(new Set(uniqueNewPhotos.map(p => p.folderPath)));
        setSelectedFolderPaths(prevSelected => Array.from(new Set([...prevSelected, ...newPaths])).sort());
        
        return combinedPhotos;
      });

    } catch (e) {
      console.error(e);
      if (e instanceof DOMException && e.name === 'AbortError') {
        // 使用者取消選擇時，不要顯示錯誤，直接重置狀態
        setError('');
      } else {
        setError('讀取本地資料夾失敗。');
      }
    } finally {
      // --- 結束進度流程 ---
      // 無論成功或失敗，最後都重置進度狀態
      setProgress({ loading: false, processed: 0, total: 0, message: '' });
    }
  };


  // 取得等效焦段的輔助函式
  const getEquivalentFocalLength = (photo: PhotoData): number | undefined => {
    const { exif } = photo;
    // 優先使用相機直接提供的等效焦段
    if (typeof exif.FocalLengthIn35mmFormat === 'number' && exif.FocalLengthIn35mmFormat > 0) {
      return exif.FocalLengthIn35mmFormat;
    }
    // 其次，如果使用者有設定換算比例，則手動計算
    if (exif.Model && cropFactors[exif.Model] && typeof exif.FocalLength === 'number') {
      return Math.round(exif.FocalLength * cropFactors[exif.Model]);
    }
    // 最後，回傳原始焦段 (當作全幅)
    return exif.FocalLength;
  }

  const parseFocalLengthRanges = (rangesStr: string): ParsedRange[] => {
    const groups = rangesStr.split(',');

    return (groups.map(group => {
      const trimmedGroup = group.trim();

      // 處理 "other" 關鍵字 (功能三)
      if (trimmedGroup.toLowerCase() === 'other') {
        return {
          label: 'Other',
          type: 'other',
          // 'other' 的測試邏輯比較特殊，會在主函式中處理
          test: () => false, 
        };
      }

      // 處理合併區間 "+" (功能一)
      if (trimmedGroup.includes('+')) {
        const subRanges = trimmedGroup.split('+').map(r => r.trim());
        const parsedSubRanges = subRanges.map(sub => {
          const [min, max] = sub.split('-').map(Number);
          return { min, max };
        });

        // 檢查所有子區間是否都合法
        if (parsedSubRanges.some(r => isNaN(r.min) || isNaN(r.max))) {
          return null; // 有不合法的子區間，則整個群組無效
        }

        return {
          label: subRanges.map(s => `[${s}]`).join('+') + 'mm',
          type: 'merged',
          test: (fl: number) => parsedSubRanges.some(r => fl >= r.min && fl <= r.max),
        };
      }

      // 處理單一數值 (功能二)
      if (!trimmedGroup.includes('-')) {
        const focalLength = Number(trimmedGroup);
        if (!isNaN(focalLength)) {
          return {
            label: `${focalLength}mm`,
            type: 'single',
            // 使用 Math.round 讓 84.5mm 或 85.4mm 都能被算進 85mm
            test: (fl: number) => Math.round(fl) === focalLength,
          };
        }
      }

      // 處理標準的 "min-max" 區間
      const [min, max] = trimmedGroup.split('-').map(Number);
      if (!isNaN(min) && !isNaN(max)) {
        return {
          label: `${min}-${max}mm`,
          type: 'range',
          test: (fl: number) => fl >= min && fl <= max,
        };
      }

      return null; // 如果格式不符，返回 null
    }).filter(Boolean) as ParsedRange[]); // 過濾掉所有 null 的無效項目
  };


  // 處理圖表生成
  const handleGenerateChart = () => {
    const photosFromSelectedFolders = allPhotos.filter(photo =>
      selectedFolderPaths.includes(photo.folderPath)
    );

    if (selectedModels.length === 0 || selectedLenses.length === 0) {
      setChartData({
        labels: [], // 沒有標籤
        datasets: [{
          label: '未選取任何相機/鏡頭', // 顯示在圖表上的提示訊息
          data: [], // 沒有資料
          backgroundColor: [],
          borderColor: [],
          borderWidth: 1,
        }],
      });
      return; // 直接返回，不再執行後續的統計
    }

    const filteredPhotos = photosFromSelectedFolders.filter(photo => {
      const modelMatch = selectedModels.includes(photo.exif.Model || '');
      let lensMatch = true;
      if (photo.exif.LensModel) {
        lensMatch = selectedLenses.includes(photo.exif.LensModel);
      }
      return modelMatch && lensMatch;
    });

    const counts: { [key: string]: number } = {};
    let labels: string[] = [];

    // --- 焦段統計邏輯 ---
    if (groupBy === 'FocalLength') {
      if (focalLengthMode === 'range') { // [Request 5] 區間模式

        const parsedRanges = parseFocalLengthRanges(focalLengthRanges);

        const otherRule = parsedRanges.find(r => r.type === 'other');
        const regularRules = parsedRanges.filter(r => r.type !== 'other');

        labels = parsedRanges.map(r => r.label);
        labels.forEach(l => counts[l] = 0);

        filteredPhotos.forEach(photo => {
          const focalLength = getEquivalentFocalLength(photo);
          if (typeof focalLength === 'number') {
            // 先嘗試匹配常規規則
            const foundRule = regularRules.find(rule => rule.test(focalLength));
            
            if (foundRule) {
              counts[foundRule.label]++;
            } else if (otherRule) {
              // 如果沒有匹配到任何常規規則，且使用者定義了 'other'，則歸入 'Other'
              counts[otherRule.label]++;
            }
          }
        });

        if (otherRule && counts[otherRule.label] === 0) {
          delete counts[otherRule.label];
          labels = labels.filter(l => l !== otherRule.label);
        }

      } else { // [Request 5] 連續直方圖模式
          const focalLengths = filteredPhotos.map(getEquivalentFocalLength).filter(fl => typeof fl === 'number') as number[];
          if(focalLengths.length === 0) {
              setChartData(null);
              return;
          }
          const minFl = Math.min(...focalLengths);
          const maxFl = Math.max(...focalLengths);
          
          for (let i = minFl; i <= maxFl; i++) {
              counts[i.toString()] = 0;
          }
          focalLengths.forEach(fl => {
              counts[Math.round(fl).toString()]++;
          });
          labels = Object.keys(counts); // 依照焦段自然排序

          const sortedByCount = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
          setTopFocalLengthLabels(sortedByCount.slice(0, 3));
      }
    } else { // --- 其他屬性統計邏輯 ---
        filteredPhotos.forEach(photo => {
            const key = (photo.exif[groupBy] as string) || 'Unknown';
            counts[key] = (counts[key] || 0) + 1;
        });
        // 依照數量從多到少排序
        labels = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
        setTopFocalLengthLabels([]);
    }
    
    // --- 轉換為 Chart.js 資料格式 ---
    const data = labels.map(label => counts[label]);
    // const total = data.reduce((sum, val) => sum + val, 0);
    const colors = data.map(() => `rgba(${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, 0.6)`);

    setChartData({
      labels,
      datasets: [{
        label: `依 ${GROUP_BY_LABELS[groupBy] || groupBy} 統計之照片張數`,
        data,
        backgroundColor: colors,
        borderColor: colors.map(c => c.replace('0.6', '1')),
        borderWidth: 1,
      }],
    });
  };

  const isHorizontal = ['Model', 'LensModel'].includes(groupBy);
  const activeFilterCount = selectedModels.length + selectedLenses.length + selectedFolderPaths.length;

  // --- JSX 渲染 ---
  return (
    <div className="container">
      <h1>照片 EXIF 資訊統計器</h1>
      <div className="card">
        <button onClick={handleLocalFolderSelect} disabled={progress.loading}>
          {allPhotos.length > 0 ? '重新選擇/加入本地資料夾' : '選擇本地資料夾'}
        </button>
        {progress.loading && (
          <div className="progress-container">
            <p>{progress.message}</p>
            {progress.total > 0 && (
              <>
                <progress value={progress.processed} max={progress.total}></progress>
                <span>{progress.processed} / {progress.total}</span>
              </>
            )}
          </div>
        )}
        {error && <p className="error-message">{error}</p>}
        {allPhotos.length > 0 && (
          <button onClick={() => setSidebarOpen(true)} style={{ marginLeft: '10px' }}>
            篩選與設定 {activeFilterCount > 0 && `(${activeFilterCount})`}
          </button>
        )}
      </div>
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setSidebarOpen(false)}
        availableFolders={allFolderPaths}
        selectedFolders={selectedFolderPaths}
        onFolderChange={setSelectedFolderPaths}
        availableModels={availableModels}
        selectedModels={selectedModels}
        onModelChange={setSelectedModels}
        availableLenses={availableLenses}
        selectedLenses={selectedLenses}
        onLensChange={setSelectedLenses}
        cropFactors={cropFactors}
        onCropFactorChange={handleCropFactorChange}
      />

      {allPhotos.length > 0 && (
        <div className="main-layout">
          <div className="content-area">
            <div className="card">
              <h2>分析及統計項目（共 {allPhotos.length} 張）</h2>
              <div className="form-group form-group-full-width">
                <select value={groupBy} onChange={e => setGroupBy(e.target.value as keyof ExifData)}>
                  <option value="Model">相機型號</option>
                  <option value="LensModel">鏡頭型號</option>
                  <option value="FocalLength">等效焦段</option>
                  {/* ... 其他選項 ... */}
                </select>
              </div>
              {/* {groupBy !== 'FocalLength' && (
                <button onClick={handleGenerateChart} className="generate-button">生成統計圖表</button>
              )} */}
              {/* <button onClick={handleGenerateChart} className="generate-button">生成統計圖表</button> */}
            </div>
            
            {groupBy === 'FocalLength' && (
              <div className="card focal-options-card">
                <h3>焦段設定</h3>
                <div className="focal-options-grid">
                  <div className="form-group">
                    <label>統計模式:</label>
                    <div className="button-group">
                      <button 
                        className={focalLengthMode === 'range' ? 'active' : ''} 
                        onClick={() => setFocalLengthMode('range')}
                      >
                        <span className="icon">指定區間</span>
                      </button>
                      <button 
                        className={focalLengthMode === 'continuous' ? 'active' : ''} 
                        onClick={() => setFocalLengthMode('continuous')}
                      >
                        <span className="icon">全部焦段</span>
                      </button>
                    </div>
                  </div>
                  
                  {/* 只有在 "區間統計" 模式下才顯示 */}
                  {focalLengthMode === 'range' && (
                    <div className="form-group">
                      <label>焦段區間設定:</label>
                      <input 
                        type="text" 
                        value={focalLengthRanges} 
                        onChange={e => setFocalLengthRanges(e.target.value)} 
                        // placeholder="例如: 24-70, 70-200, 200-500"
                      />
                      <small className="helper-text">
                        用 `,` 分隔，支援 `24-70` (區間), `85` (單值), `24-70+100-400` (合併), `other` (其他)。
                      </small>
                    </div>
                  )}
                </div>
              </div>
            )}

            {chartData && (
              <div className="card chart-container">
                <Bar 
                  data={chartData} 
                  options={{
                    indexAxis: isHorizontal ? 'y' : 'x', // [Request 6] 動態設定圖表方向
                    responsive: true,
                    layout: {
                      padding: {
                        top: 0,
                        right: 40 // 調大一點，給標籤留空間
                      }
                    },
                    plugins: {
                      legend: { display: false },
                      title: { display: true, text: chartData.datasets[0].label },
                      // [Request 7] 設定百分比標籤
                      datalabels: {
                        anchor: 'end',
                        align: 'end',
                        clip: false,
                        formatter: (value, context) => {
                          if (groupBy === 'FocalLength' && focalLengthMode === 'continuous') {
                            const currentLabel = context.chart.data.labels?.[context.dataIndex] as string;
                            if (!topFocalLengthLabels.includes(currentLabel)) {
                              return null; // 如果不是前三名，不顯示標籤
                            }
                          }
                          const total = context.chart.data.datasets[0].data.reduce<number>(
                              (sum, val) => sum + (Number(val) || 0),
                              0
                          );
                          if (total === 0) return '0%';
                          const percentage = ((value / total) * 100).toFixed(1) + '%';
                          return `${value} (${percentage})`;
                        },
                        color: '#333',
                        font: {
                            weight: 'bold',
                        }
                      }
                    },
                    scales: { // [Request 6] 讓長標籤有足夠空間
                        y: {
                            ticks: {
                                autoSkip: false
                            }
                        }
                    }
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
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