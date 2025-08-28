// src/App.tsx
import { useState, useMemo, useEffect, useRef } from 'react';
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
import './App.css';

// Register Chart.js components and plugins
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ChartDataLabels
);

// Define TypeScript interfaces for EXIF data and photo structure
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

// Define the structure for photo data
interface PhotoData {
  id: string;
  source: 'local' | 'synology';
  filename: string;
  exif: ExifData;
  folderPath: string;
}

// Define the structure for chart data
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

// Define the type for crop factors
function App() {
  const [localPhotos, setLocalPhotos] = useState<PhotoData[]>([]);
  const [progress, setProgress] = useState({
    loading: false,
    total: 0,       
    processed: 0,   
    message: '',    
  });
  // Error message state
  const [error, setError] = useState('');
  // Filter and grouping states
  const [groupBy, setGroupBy] = useState<keyof ExifData>('Model'); 
  const [focalLengthMode, setFocalLengthMode] = useState<'range' | 'continuous'>('range'); 
  const [focalLengthRanges, setFocalLengthRanges] = useState('14-23, 24-70, 70-200, other'); 
  // Selected filters
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedLenses, setSelectedLenses] = useState<string[]>([]);
  // Folder paths
  const [allFolderPaths, setAllFolderPaths] = useState<string[]>([]);
  const [selectedFolderPaths, setSelectedFolderPaths] = useState<string[]>([]);
  // Chart data state
  const [chartData, setChartData] = useState<ChartData | null>(null);
  // Sidebar visibility state
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  // Top focal length labels for highlighting
  const [topFocalLengthLabels, setTopFocalLengthLabels] = useState<string[]>([]);
  // Crop factors state
  const [cropFactors, setCropFactors] = useState<CropFactorMap>(defaultCropFactors);
  // Debounced focal length ranges for performance
  const [debouncedFocalLengthRanges, setDebouncedFocalLengthRanges] = useState(focalLengthRanges);
  // Mapping for group by labels
  const GROUP_BY_LABELS: { [key: string]: string } = {
    Model: '相機型號',
    LensModel: '鏡頭型號',
    FocalLength: '等效焦段',
  };
  // Reference for hidden file input (legacy folder selection)
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Combine all photos for easier processing
  const allPhotos = useMemo(() => [...localPhotos], [localPhotos]);
  // Compute available models and lenses from the photos
  const availableModels = useMemo(() => {
    const models = new Set(allPhotos.map(p => p.exif.Model).filter(Boolean));
    return Array.from(models).sort() as string[];
  }, [allPhotos]);
  // Compute available lenses from the photos
  const availableLenses = useMemo(() => {
    const lenses = new Set(allPhotos.map(p => p.exif.LensModel).filter(Boolean));
    return Array.from(lenses).sort() as string[];
  }, [allPhotos]);
  // Automatically select all models and lenses when they change
  useEffect(() => {
    setSelectedModels(availableModels);
  }, [availableModels]);
  // Automatically select all lenses when they change
  useEffect(() => {
    setSelectedLenses(availableLenses);
  }, [availableLenses]);
  // Debounce focal length range input to avoid excessive updates
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFocalLengthRanges(focalLengthRanges);
    }, 800);
    return () => {
      clearTimeout(timer);
    };
  }, [focalLengthRanges]);
  // Regenerate chart when dependencies change
  useEffect(() => {
    if (allPhotos.length > 0) {
      console.log("偵測到依賴項變更，自動生成圖表..."); // for debugging
      handleGenerateChart();
    }
  }, [
    groupBy,              
    focalLengthMode,      
    debouncedFocalLengthRanges,
    selectedModels,       
    selectedLenses,       
    selectedFolderPaths,  
    cropFactors,          
    allPhotos             
  ]);
  // Handle changes to crop factors
  const handleCropFactorChange = (model: string, factorStr: string) => {
    const factor = parseFloat(factorStr);
    setCropFactors(prev => ({
      ...prev,
      [model]: isNaN(factor) || factor <= 0 ? 1.0 : factor,
    }));
  };
  // Function to recursively count image files in a directory
  const countFiles = async (dirHandle: FileSystemDirectoryHandle): Promise<number> => {
    let count = 0;
    const imageRegex = /\.(jpe?g|heic|cr3|arw)$/i;
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file' && imageRegex.test(entry.name)) {
        count++;
      } else if (entry.kind === 'directory') {
        count += await countFiles(entry); 
      }
    }
    return count;
  };
  // Function to recursively process a directory and extract photo data
  const processDirectory = async (dirHandle: FileSystemDirectoryHandle, currentPath: string, onProgress: () => void): Promise<PhotoData[]> => {
    const photoResults: PhotoData[] = [];
    const imageRegex = /\.(jpe?g|heic|cr3|arw)$/i; 
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
            folderPath: currentPath, 
          });
        } catch (e) {
          console.warn(`無法解析檔案 ${file.name} 的 EXIF`, e);
        } finally {
          onProgress();
        }
      } else if (entry.kind === 'directory') {
        const subFolderPhotos = await processDirectory(entry, entryPath, onProgress);
        photoResults.push(...subFolderPhotos);
      }
    }
    return photoResults;
  };
  // Handle legacy folder selection via hidden file input
  const handleLegacyFolderSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    const files = event.target.files;
    if (!files || files.length === 0) {
      return; 
    }
    const fileArray = Array.from(files);
    const totalFiles = fileArray.length;
    // Set progress state to loading
    setProgress({ loading: true, processed: 0, total: totalFiles, message: '正在解析照片 EXIF 資訊...' });
    // Process each file to extract EXIF data
    const photoPromises = fileArray.map(async (file) => {
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
        const folderPath = file.webkitRelativePath.substring(0, file.webkitRelativePath.lastIndexOf('/')) || 'Selected Folder';
        // Update progress after processing each file
        setProgress(prev => ({ ...prev, processed: prev.processed + 1 }));
        return {
          id: `local-${file.name}-${file.lastModified}`,
          source: 'local',
          filename: file.name,
          exif: processedExif,
          folderPath: folderPath,
        };
      } catch (e) {
        console.warn(`無法解析檔案 ${file.name} 的 EXIF`, e);
        setProgress(prev => ({ ...prev, processed: prev.processed + 1 }));
        return null;
      }
    });
    // Wait for all files to be processed and filter out any null results
    const newPhotos = (await Promise.all(photoPromises)).filter(Boolean) as PhotoData[];
    // Merge new photos with existing ones, avoiding duplicates
    setLocalPhotos(prevPhotos => {
      const existingIds = new Set(prevPhotos.map(p => p.id));
      const uniqueNewPhotos = newPhotos.filter(p => !existingIds.has(p.id));
      const combinedPhotos = [...prevPhotos, ...uniqueNewPhotos];
      const allPaths = Array.from(new Set(combinedPhotos.map(p => p.folderPath))).sort();
      setAllFolderPaths(allPaths);
      const newPaths = Array.from(new Set(uniqueNewPhotos.map(p => p.folderPath)));
      setSelectedFolderPaths(prevSelected => Array.from(new Set([...prevSelected, ...newPaths])).sort());
      return combinedPhotos;
    });
    // Reset the file input value to allow re-selection of the same folder
    if (event.target) {
      event.target.value = '';
    }
    // Reset progress state
    setProgress({ loading: false, processed: 0, total: 0, message: '' });
  };
  
  // Handle folder selection using the File System Access API
  const handleLocalFolderSelect = async () => {
    if (window.showDirectoryPicker) {
      console.log("使用 File System Access API (新方法)");
      setError('');
      try {
        const dirHandle = await window.showDirectoryPicker();
        setProgress({ loading: true, processed: 0, total: 0, message: '正在掃描檔案總數...' });
        const totalFiles = await countFiles(dirHandle);
        if (totalFiles === 0) {
          setError('在選擇的資料夾及其子資料夾中沒有找到符合條件的照片檔案。');
          setProgress({ loading: false, processed: 0, total: 0, message: '' });
          return;
        }
        // Set progress state to loading
        setProgress({ loading: true, processed: 0, total: totalFiles, message: '正在解析照片 EXIF 資訊...' });
        const onProgressUpdate = () => {
          setProgress(prev => ({ ...prev, processed: prev.processed + 1 }));
        };
        // Process the selected directory
        const newPhotos = await processDirectory(dirHandle, dirHandle.name, onProgressUpdate);
        // Merge new photos with existing ones, avoiding duplicates
        setLocalPhotos(prevPhotos => {
          const existingIds = new Set(prevPhotos.map(p => p.id));
          const uniqueNewPhotos = newPhotos.filter(p => !existingIds.has(p.id));
          const combinedPhotos = [...prevPhotos, ...uniqueNewPhotos];
          const allPaths = Array.from(new Set(combinedPhotos.map(p => p.folderPath))).sort();
          setAllFolderPaths(allPaths);
          const newPaths = Array.from(new Set(uniqueNewPhotos.map(p => p.folderPath)));
          setSelectedFolderPaths(prevSelected => Array.from(new Set([...prevSelected, ...newPaths])).sort());
          return combinedPhotos;
        });
      } catch (e) {
        console.error(e);
        if (e instanceof DOMException && e.name === 'AbortError') {
          setError(''); 
        } else {
          setError('讀取本地資料夾失敗。');
        }
      } finally {
        setProgress({ loading: false, processed: 0, total: 0, message: '' });
      }
    } else {
      console.log("瀏覽器不支援，使用傳統 input (備用方案)");
      if (fileInputRef.current) {
        fileInputRef.current.click();
      }
    }
  };

  // Calculate equivalent focal length based on crop factor
  const getEquivalentFocalLength = (photo: PhotoData): number | undefined => {
    const { exif } = photo;
    // Use 35mm equivalent if available
    if (typeof exif.FocalLengthIn35mmFormat === 'number' && exif.FocalLengthIn35mmFormat > 0) {
      return exif.FocalLengthIn35mmFormat;
    }
    // Apply crop factor if known
    if (exif.Model && cropFactors[exif.Model] && typeof exif.FocalLength === 'number') {
      return Math.round(exif.FocalLength * cropFactors[exif.Model]);
    }
    // Fallback to actual focal length
    return exif.FocalLength;
  }

  // Parse focal length ranges input into structured rules
  const parseFocalLengthRanges = (rangesStr: string): ParsedRange[] => {
    const groups = rangesStr.split(',');
    return (groups.map(group => {
      const trimmedGroup = group.trim();
      if (trimmedGroup.toLowerCase() === 'other') {
        return {
          label: 'Other',
          type: 'other',

          test: () => false, 
        };
      }
      // Handle merged ranges like "18-55+70-200"
      if (trimmedGroup.includes('+')) {
        const subRanges = trimmedGroup.split('+').map(r => r.trim());
        const parsedSubRanges = subRanges.map(sub => {
          const [min, max] = sub.split('-').map(Number);
          return { min, max };
        });
        // If any sub-range is invalid, skip this rule
        if (parsedSubRanges.some(r => isNaN(r.min) || isNaN(r.max))) {
          return null; 
        }
        // Create a test function that checks if a focal length falls within any of the sub-ranges
        return {
          label: subRanges.map(s => `[${s}]`).join('+') + 'mm',
          type: 'merged',
          test: (fl: number) => parsedSubRanges.some(r => fl >= r.min && fl <= r.max),
        };
      }

      // Handle single focal lengths like "50"
      if (!trimmedGroup.includes('-')) {
        const focalLength = Number(trimmedGroup);
        if (!isNaN(focalLength)) {
          return {
            label: `${focalLength}mm`,
            type: 'single',
            test: (fl: number) => Math.round(fl) === focalLength,
          };
        }
      }

      // Handle ranges like "24-70"
      const [min, max] = trimmedGroup.split('-').map(Number);
      if (!isNaN(min) && !isNaN(max)) {
        return {
          label: `${min}-${max}mm`,
          type: 'range',
          test: (fl: number) => fl >= min && fl <= max,
        };
      }
      return null; 
    }).filter(Boolean) as ParsedRange[]); 
  };

  // Generate chart data based on current filters and grouping
  const handleGenerateChart = () => {
    const photosFromSelectedFolders = allPhotos.filter(photo =>
      selectedFolderPaths.includes(photo.folderPath)
    );
    // If no models or lenses are selected, clear the chart
    if (selectedModels.length === 0 || selectedLenses.length === 0) {
      setChartData({
        labels: [],
        datasets: [{
          label: '未選取任何相機/鏡頭', 
          data: [], 
          backgroundColor: [],
          borderColor: [],
          borderWidth: 1,
        }],
      });
      return; 
    }
    // Filter photos based on selected models and lenses
    const filteredPhotos = photosFromSelectedFolders.filter(photo => {
      const modelMatch = selectedModels.includes(photo.exif.Model || '');
      let lensMatch = true;
      if (photo.exif.LensModel) {
        lensMatch = selectedLenses.includes(photo.exif.LensModel);
      }
      return modelMatch && lensMatch;
    });
    // If no photos match the filters, clear the chart
    const counts: { [key: string]: number } = {};
    let labels: string[] = [];

    // Handle grouping by focal length with different modes
    if (groupBy === 'FocalLength') {
      if (focalLengthMode === 'range') { 
        const parsedRanges = parseFocalLengthRanges(focalLengthRanges);
        const otherRule = parsedRanges.find(r => r.type === 'other');
        const regularRules = parsedRanges.filter(r => r.type !== 'other');

        labels = parsedRanges.map(r => r.label);
        labels.forEach(l => counts[l] = 0);

        filteredPhotos.forEach(photo => {
          const focalLength = getEquivalentFocalLength(photo);
          if (typeof focalLength === 'number') {

            const foundRule = regularRules.find(rule => rule.test(focalLength));
            
            if (foundRule) {
              counts[foundRule.label]++;
            } else if (otherRule) {
              counts[otherRule.label]++;
            }
          }
        });
        // Remove "Other" label if it has zero count
        if (otherRule && counts[otherRule.label] === 0) {
          delete counts[otherRule.label];
          labels = labels.filter(l => l !== otherRule.label);
        }
      } else { 
          // Continuous mode: count each focal length individually
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
          labels = Object.keys(counts);

          const sortedByCount = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
          setTopFocalLengthLabels(sortedByCount.slice(0, 3));
      }
    } else { 
        filteredPhotos.forEach(photo => {
            const key = (photo.exif[groupBy] as string) || 'Unknown';
            counts[key] = (counts[key] || 0) + 1;
        });

        labels = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
        setTopFocalLengthLabels([]);
    }
    
    // Prepare data for Chart.js
    const data = labels.map(label => counts[label]);
    const colors = data.map(() => `rgba(${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, 0.6)`);

    // Highlight top 3 focal lengths in continuous mode
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

  // Determine if the chart should be horizontal based on grouping
  const isHorizontal = ['Model', 'LensModel'].includes(groupBy);
  const activeFilterCount = selectedModels.length + selectedLenses.length + selectedFolderPaths.length;

  // Component for rendering filter groups with select all functionality
  return (
    <div className="container">
      <input
        type="file"
        webkitdirectory="true" 
        ref={fileInputRef}
        onChange={handleLegacyFolderSelect} 
        style={{ display: 'none' }} 
        multiple 
      />
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
                </select>
              </div>
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
                  
                  {focalLengthMode === 'range' && (
                    <div className="form-group">
                      <label>焦段區間設定:</label>
                      <input 
                        type="text" 
                        value={focalLengthRanges} 
                        onChange={e => setFocalLengthRanges(e.target.value)} 
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
                    indexAxis: isHorizontal ? 'y' : 'x', 
                    responsive: true,
                    layout: {
                      padding: {
                        top: 0,
                        right: 40 
                      }
                    },
                    plugins: {
                      legend: { display: false },
                      title: { display: true, text: chartData.datasets[0].label },
                      datalabels: {
                        anchor: 'end',
                        align: 'end',
                        clip: false,
                        formatter: (value, context) => {
                          if (groupBy === 'FocalLength' && focalLengthMode === 'continuous') {
                            const currentLabel = context.chart.data.labels?.[context.dataIndex] as string;
                            if (!topFocalLengthLabels.includes(currentLabel)) {
                              return null;
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
                    scales: {
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