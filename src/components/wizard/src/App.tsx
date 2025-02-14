import React from 'react';
import ReactDOM from 'react-dom/client';
import Layout from './Layout';
import './Layout.css'; // Global styles
import { ConfigurationProvider } from './views/ClockTree';

// Define an interface for the complete JSON structure
export interface AppData {
  sidebarOptions: string[];
  clockTree: any; // Replace 'any' with a more specific type if available
  // Add other sections as needed
}

interface AppState {
  appData: AppData | null;
}

export class App extends React.Component<{}, AppState> {
  constructor(props: {}) {
    super(props);
    this.state = {
      appData: null,
    };
  }

  componentDidMount() {
    window.addEventListener('message', this.handleMessage);
  }

  componentWillUnmount() {
    window.removeEventListener('message', this.handleMessage);
  }

  // Message event handler that updates the state when options are received
  handleMessage = (event: MessageEvent) => {
    const message = event.data;
    if (message.type === 'options' && message.data && Array.isArray(message.data.sidebarOptions)) {
      this.setState({ appData: message.data });
    }
  };

  render() {
    if (!this.state.appData || this.state.appData.sidebarOptions.length === 0) {
      return <div>Loading...</div>;
    }
    return <Layout options={this.state.appData.sidebarOptions} />;
  }

  static renderApp(rootElement: HTMLElement): void {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <ConfigurationProvider>
          <App />
        </ConfigurationProvider>
      </React.StrictMode>
    );
  }
}

