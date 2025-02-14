// src/views/Dashboard.tsx
import React from 'react';

interface DashboardState {
  selectedVariation: 'default' | 'analytics';
}

class Dashboard extends React.Component<{}, DashboardState> {
  constructor(props: {}) {
    super(props);
    this.state = {
      selectedVariation: 'default',
    };
  }

  handleVariationChange = (variation: 'default' | 'analytics') => {
    this.setState({ selectedVariation: variation });
  };

  renderActiveView() {
    const { selectedVariation } = this.state;

    if (selectedVariation === 'default') {
      return (
        <div>
          <h3>Default Dashboard</h3>
          <p>Welcome to the default dashboard view.</p>
          {/* Add more content specific to the default dashboard here */}
        </div>
      );
    } else if (selectedVariation === 'analytics') {
      return (
        <div>
          <h3>Analytics Dashboard</h3>
          <p>Welcome to the analytics dashboard view.</p>
          {/* Add more content specific to the analytics dashboard here */}
        </div>
      );
    } else {
      return (
        <div>
          <h3>Dashboard</h3>
          <p>Please select a variation.</p>
        </div>
      );
    }
  }

  render() {
    const { selectedVariation } = this.state;

    return (
      <div>
        <h2>Dashboard</h2>
        <div style={{ marginBottom: '20px' }}>
          <button
            onClick={() => this.handleVariationChange('default')}
            style={{
              padding: '10px 20px',
              marginRight: '10px',
              backgroundColor: selectedVariation === 'default' ? '#ddd' : '#fff',
              border: '1px solid #ccc',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Default
          </button>
          <button
            onClick={() => this.handleVariationChange('analytics')}
            style={{
              padding: '10px 20px',
              backgroundColor: selectedVariation === 'analytics' ? '#ddd' : '#fff',
              border: '1px solid #ccc',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Analytics
          </button>
        </div>
        {this.renderActiveView()}
      </div>
    );
  }
}

export default Dashboard;
