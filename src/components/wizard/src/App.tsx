import React, {useEffect} from 'react';
import ReactDOM from 'react-dom/client';
import Layout from './Layout';
import './Layout.css'; // Global styles
import { ConfigurationProvider } from './views/ClockTree';

export interface SidebarOption {
  name: string;
  icon: string;
  path: string;
  context: any[];
}

export interface AppData {
  sidebarOptions: SidebarOption[];
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

  // Message event handler that updates the state when a new configuration is received
  handleMessage = (event: MessageEvent) => {
    const message = event.data;
    if (message.data) {
      switch (message.type) {
        case 'options':
          this.setState({ appData: message.data });
        break;
      }
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

export default App;