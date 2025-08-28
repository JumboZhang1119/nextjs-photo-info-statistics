// src/components/Sidebar.tsx
import React from 'react';

// A reusable component for filter groups
const FilterGroup: React.FC<{
  title: string;
  items: string[];
  selectedItems: string[];
  onChange: (selected: string[]) => void;
}> = ({ title, items, selectedItems, onChange }) => {
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.checked ? items : []);
  };
  const handleItemChange = (item: string, checked: boolean) => {
    onChange(checked ? [...selectedItems, item] : selectedItems.filter(i => i !== item));
  };
  const isAllSelected = items.length > 0 && selectedItems.length === items.length;
  // Render the filter group UI
  return (
    <div className="filter-group">
      <h4>{title}</h4>
      <div className="filter-list">
        <label>
          <input type="checkbox" checked={isAllSelected} onChange={handleSelectAll} />
          <strong>(全選/取消)</strong>
        </label>
        {items.map(item => (
          <label key={item}>
            <input type="checkbox" value={item} checked={selectedItems.includes(item)} onChange={e => handleItemChange(item, e.target.checked)} />
            {item}
          </label>
        ))}
      </div>
    </div>
  );
};

// Define the props for the Sidebar component
interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  availableFolders: string[];
  selectedFolders: string[];
  onFolderChange: (selected: string[]) => void;
  availableModels: string[];
  selectedModels: string[];
  onModelChange: (selected: string[]) => void;
  availableLenses: string[];
  selectedLenses: string[];
  onLensChange: (selected: string[]) => void;
  cropFactors: { [model: string]: number | undefined };
  onCropFactorChange: (model: string, factor: string) => void;
}

// The main Sidebar component
export const Sidebar: React.FC<SidebarProps> = ({
  isOpen, onClose,
  availableFolders, selectedFolders, onFolderChange,
  availableModels, selectedModels, onModelChange,
  availableLenses, selectedLenses, onLensChange,
  cropFactors, onCropFactorChange
}) => {
  return (
    <>
      <div className={`sidebar-overlay ${isOpen ? 'open' : ''}`} onClick={onClose}></div>
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h3>篩選與設定</h3>
          <button onClick={onClose}>關閉</button>
        </div>
        <div className="sidebar-content">
          <FilterGroup title="資料夾" items={availableFolders} selectedItems={selectedFolders} onChange={onFolderChange} />
          <FilterGroup title="相機型號" items={availableModels} selectedItems={selectedModels} onChange={onModelChange} />
          <FilterGroup title="鏡頭型號" items={availableLenses} selectedItems={selectedLenses} onChange={onLensChange} />
          <div className="filter-group">
            <h4>相機等效焦段倍率</h4>
            <div className="crop-factor-list">
              {availableModels.map(model => (
                <div key={model} className="crop-factor-item">
                  <span className="model-name" title={model}>{model}</span>
                  <input
                    type="number"
                    className="crop-factor-input"
                    placeholder="e.g. 1.5"
                    step="0.1"
                    value={cropFactors[model] || ''}
                    onChange={(e) => onCropFactorChange(model, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};