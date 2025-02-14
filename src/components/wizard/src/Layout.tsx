// src/Layout.tsx
import React from 'react';
import './Layout.css';
import ClockTree from './views/ClockTree'; // Import the ClockTree component
import View from './views/View'; // Import the generic View component
import { ConfigurationContext } from './views/ClockTree';
import { useContext } from 'react';

interface LayoutProps {
  options: string[]; // List of navigator items
}

interface LayoutState {
  activeIndex: number | null;
}

class Layout extends React.Component<LayoutProps, LayoutState> {
  constructor(props: LayoutProps) {
    super(props);
    this.state = {
      activeIndex: null,
    };
  }

  handleItemClick = (index: number) => {
    this.setState({ activeIndex: index });
  };

  renderActiveView() {
    const { activeIndex } = this.state;
    const { options } = this.props;

    if (activeIndex === null || !options[activeIndex]) {
      return (
        <div>
          <h2>Welcome!</h2>
          <p>Please select an option from the navigator.</p>
        </div>
      );
    }

    const selectedOption = options[activeIndex];

    if (selectedOption === 'Clock') {
      return <ClockTree />;
    } else {
      // For other options, render generic View
      return <View title={selectedOption} />;
    }
  }

  render() {
    const { options } = this.props;
    const { activeIndex } = this.state;

    return (
      <LayoutContent
        activeIndex={activeIndex}
        options={options}
        handleItemClick={this.handleItemClick}
        renderActiveView={this.renderActiveView.bind(this)}
      />
    );
  }
}

export default Layout;

// Create a separate functional component to use hooks
const LayoutContent: React.FC<{
  activeIndex: number | null;
  options: string[];
  handleItemClick: (index: number) => void;
  renderActiveView: () => React.ReactNode;
}> = ({ activeIndex, options, handleItemClick, renderActiveView }) => {
  const { config, setConfig } = useContext(ConfigurationContext);

  const handleApply = () => {
    if (!config) {
      alert('No configuration to apply.');
      return;
    }

    const jsonStr = JSON.stringify(config, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'clock-tree-config.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        // Basic validation
        if (json.clocks && Array.isArray(json.clocks)) {
          setConfig(json);
          alert('Configuration imported successfully.');
        } else {
          throw new Error('Invalid configuration format.');
        }
      } catch (error) {
        alert('Failed to import configuration: ' + error);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="layout-container">
      {/* Top Bar */}
      <div className="layout-top-bar">
        <p>Top Bar</p>
      </div>

      {/* Middle Section: Navigator + Main Content */}
      <div className="layout-middle">
        {/* Left Navigator */}
        <div className="layout-left-sidebar">
          <h3>Navigator</h3>
          <ul>
            {options.map((item, index) => (
              <li key={index}>
                <div
                  className={`sidebar-item ${activeIndex === index ? 'active' : ''}`}
                  onClick={() => handleItemClick(index)}
                >
                  {item}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Main Content */}
        <div className="layout-main-content">{renderActiveView()}</div>
      </div>

      {/* Bottom Bar */}
      <div
        className="layout-bottom-bar"
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          paddingRight: '20px',
        }}
      >
        {/* Import Button */}
        <label htmlFor="import-config" style={{ marginRight: '10px', cursor: 'pointer' }}>
          <button
            style={{
              padding: '10px 20px',
              backgroundColor: '#555555',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Import
          </button>
        </label>
        <input
          type="file"
          id="import-config"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={handleImport}
        />

        {/* Apply Button */}
        <button
          onClick={handleApply}
          style={{
            padding: '10px 20px',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Apply
        </button>
      </div>
    </div>
  );
};


