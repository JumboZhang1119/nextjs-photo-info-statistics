// src/components/FilterSidebar.tsx
import React from 'react';

// Define the props for the FilterSidebar component
interface FilterSidebarProps {
  availableModels: string[];
  selectedModels: string[];
  onModelChange: (selected: string[]) => void;
  availableLenses: string[];
  selectedLenses: string[];
  onLensChange: (selected: string[]) => void;
}

// A reusable component for filter groups
const FilterGroup: React.FC<{
  title: string;
  items: string[];
  selectedItems: string[];
  onChange: (selected: string[]) => void;
}> = ({ title, items, selectedItems, onChange }) => {
  // Handle select all toggle
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.checked ? items : []);
  };
  // Handle individual item toggle
  const handleItemChange = (item: string, checked: boolean) => {
    if (checked) {
      onChange([...selectedItems, item]);
    } else {
      onChange(selectedItems.filter(i => i !== item));
    }
  };
  // Determine if all items are selected
  const isAllSelected = items.length > 0 && selectedItems.length === items.length;

  return (
    <div className="filter-group">
      <h4>{title}</h4>
      <div className="filter-list">
        <label>
          <input
            type="checkbox"
            checked={isAllSelected}
            onChange={handleSelectAll}
          />
          <strong>(全部選取/取消)</strong>
        </label>
        {items.map(item => (
          <label key={item}>
            <input
              type="checkbox"
              value={item}
              checked={selectedItems.includes(item)}
              onChange={e => handleItemChange(item, e.target.checked)}
            /> {item}
          </label>
        ))}
      </div>
    </div>
  );
};

// The main FilterSidebar component
export const FilterSidebar: React.FC<FilterSidebarProps> = ({
  availableModels,
  selectedModels,
  onModelChange,
  availableLenses,
  selectedLenses,
  onLensChange,
}) => {
  return (
    <aside className="filter-sidebar">
      <h3>篩選條件</h3>
      <FilterGroup
        title="相機型號"
        items={availableModels}
        selectedItems={selectedModels}
        onChange={onModelChange}
      />
      <FilterGroup
        title="鏡頭型號"
        items={availableLenses}
        selectedItems={selectedLenses}
        onChange={onLensChange}
      />
    </aside>
  );
};