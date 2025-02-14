  // src/views/ClockTree.tsx
  import React, {
    createContext,
    useState,
    useEffect,
    useContext,
    ReactNode,
    FC,
  } from 'react';
  import ReactFlow, {
    Background,
    Controls,
    MiniMap,
    Handle,
    Position,
    Node,
    Edge,
    NodeTypes,
  } from 'react-flow-renderer';
  import dagre from 'dagre';

  // ----------------------------------------------------------------------
  // Layout Utility using dagre
  // ----------------------------------------------------------------------
  const nodeWidth = 172;
  const nodeHeight = 100;

  const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    // Adjust these parameters to increase spacing
    const graphOptions = {
      rankdir: 'TB',       // 'TB' for top-to-bottom, or 'LR' for left-to-right
      nodesep: 50,         // Minimum horizontal distance between nodes
      ranksep: 100,        // Minimum vertical distance between nodes
      marginx: 20,         // Optional: Horizontal margin around the graph
      marginy: 20,         // Optional: Vertical margin around the graph
    };

    dagreGraph.setGraph(graphOptions);

    // Set each node with defined dimensions
    nodes.forEach((node) => {
      dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    });

    // Set each edge (dagre uses these for routing)
    edges.forEach((edge) => {
      dagreGraph.setEdge(edge.source, edge.target);
    });

    // Compute the layout
    dagre.layout(dagreGraph);

    // Update node positions from dagre's computed layout
    nodes.forEach((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      node.position = {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      };
    });

    return { nodes, edges };
  };

  // ----------------------------------------------------------------------
  // Type Definitions
  // ----------------------------------------------------------------------
  interface ClockNodeData {
    id: string;
    type: string;
    name: string;
    outputFrequency: number;
    connections?: string[];
    style?: React.CSSProperties;  // Add style property here
    component?: React.FC<{ data: ClockNodeData }>;
    interactions?: { [key: string]: any };
    // --- Extra props for editing ---
    isEditing?: boolean;
    inputValue?: string;
    error?: string;
    onInputChange?: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
    onInputKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    onBlur?: () => void;
    onSelectChange?: (e: React.ChangeEvent<HTMLSelectElement>, data: ClockNodeData) => void;
  }

  interface ConfigurationContextProps {
    config: { clocks: ClockNodeData[] } | null;
    setConfig: React.Dispatch<React.SetStateAction<{ clocks: ClockNodeData[] } | null>>;
  }

  export const ConfigurationContext = createContext<ConfigurationContextProps>({
    config: null,
    setConfig: () => { },
  });

  export const ConfigurationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [config, setConfig] = useState<{ clocks: ClockNodeData[] } | null>(null);

    useEffect(() => {
      // Fetch the clocktree.json dataree.json...');
      fetch('/clocktree.json')
        .then((response) => {
          console.log('Response received:', response);
          return response.json();
        })
        .then((data) => {
          console.log('Parsed data:', data);
          setConfig(data);
        })
        .catch((error) => {
          console.error('Error fetching clocktree.json:', error);
        });
    }, []);

    return (
      <ConfigurationContext.Provider value={{ config, setConfig }}>
        {children}
      </ConfigurationContext.Provider>
    );
  };

  export interface PLLNode extends ClockNodeData {
    type: 'PLL';
    range?: {
      type: 'interval' | 'list';
      min?: number;
      max?: number;
      values?: number[];
    };
  }

  export const PLLNodeComponent: React.FC<{ data: PLLNode }> = ({ data }) => {
    const defaultStyle: React.CSSProperties = {
      padding: 10,
      border: '2px solid #0041d0',
      borderRadius: 5,
      backgroundColor: '#e3f2fd',
      textAlign: 'center',
      width: 150,
      cursor: 'pointer',
    };

    // Merge any node-specific style with the default style, casting the result.
    const containerStyle = { ...defaultStyle, ...data.style } as React.CSSProperties;

    if (data.isEditing) {
      return (
        <div style={containerStyle} onBlur={data.onBlur}>
          <Handle type="target" position={Position.Top} />
          <div style={{ textAlign: 'center' }}>
            <strong>{data.name}</strong>
            <br />
            {data.range?.type === 'list' ? (
              <select
                value={data.outputFrequency ? (data.outputFrequency / 1e6).toFixed(2) : ''}
                onChange={(e) => {
                  data.onInputChange && data.onInputChange(e);
                  data.onSelectChange && data.onSelectChange(e, data);
                }}
                autoFocus
              >
                {!data.inputValue && (
                  <option value="" disabled>
                    Select frequency
                  </option>
                )}
                {data.range.values?.map((freq, idx) => (
                  <option key={idx} value={(freq / 1e6).toFixed(2)}>
                    {(freq / 1e6).toFixed(2)} MHz
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                inputMode="numeric"
                value={data.inputValue}
                onChange={data.onInputChange}
                onKeyDown={data.onInputKeyDown}
                autoFocus
                style={{ width: '80px' }}
              />
            )}
            {data.error && (
              <div style={{ color: 'red', fontSize: '12px' }}>{data.error}</div>
            )}
          </div>
          <Handle type="source" position={Position.Bottom} />
        </div>
      );
    }
    return (
      <div style={containerStyle}>
        <Handle type="target" position={Position.Top} />
        <div style={{ textAlign: 'center' }}>
          <strong>{data.name}</strong>
          <br />
          {data.outputFrequency
            ? `${(data.outputFrequency / 1e6).toFixed(2)} MHz`
            : ''}
        </div>
        <Handle type="source" position={Position.Bottom} />
      </div>
    );
  };

  export interface MUXNode extends ClockNodeData {
    type: 'MUX';
    sources: string[];
    selected: string;
    inputFrequencies: number[];
  }

  export const MUXNodeComponent: React.FC<{ data: MUXNode }> = ({ data }) => {
    const defaultStyle: React.CSSProperties = {
      padding: 10,
      border: '2px solid #ff5722',
      borderRadius: 5,
      backgroundColor: '#ffccbc',
      textAlign: 'center',
      width: 150,
      cursor: 'pointer',
    };

    const containerStyle = { ...defaultStyle, ...data.style } as React.CSSProperties;

    if (data.isEditing) {
      return (
        <div style={containerStyle} onBlur={data.onBlur}>
          <Handle type="target" position={Position.Top} />
          <div style={{ textAlign: 'center' }}>
            <strong>{data.name}</strong>
            <br />
            <select
              value={data.outputFrequency ? (data.outputFrequency / 1e6).toFixed(2) : ''}
              onChange={(e) => {
                data.onInputChange && data.onInputChange(e);
                if (data.inputFrequencies) {
                  const selectedValue = e.target.value;
                  const selectedIndex = data.inputFrequencies.findIndex(
                    (freq) => (freq / 1e6).toFixed(2) === selectedValue
                  );
                  if (selectedIndex >= 0 && data.sources[selectedIndex]) {
                    data.selected = data.sources[selectedIndex];
                  }
                }
                data.onSelectChange && data.onSelectChange(e, data);
              }}
              autoFocus
            >
              <option value="" disabled>
                Select source
              </option>
              {data.inputFrequencies?.map((freq, idx) => (
                  <option key={idx} value={(freq / 1e6).toFixed(2)}>
                  {data.sources[idx]}: {(freq / 1e6).toFixed(2)} MHz
                </option>
              ))}
            </select>
            {data.error && (
              <div style={{ color: 'red', fontSize: '12px' }}>{data.error}</div>
            )}
          </div>
          <Handle type="source" position={Position.Bottom} />
        </div>
      );
    }

    return (
      <div style={containerStyle}>
        <Handle type="target" position={Position.Top} />
        <div style={{ textAlign: 'center' }}>
          <strong>{data.name}</strong>
          <br />
          {data.outputFrequency
            ? `${(data.outputFrequency / 1e6).toFixed(2)} MHz`
            : ''}
        </div>
        <Handle type="source" position={Position.Bottom} />
      </div>
    );
  }

  export interface PrescalerNode extends ClockNodeData {
    type: 'Prescaler';
    source: string;
    inputFrequency: number;
    divisionFactor: number;
    multiplicationFactor: number;
  }

  export const PrescalerNodeComponent: React.FC<{ data: PrescalerNode}> = ({ data }) => {
    const defaultStyle: React.CSSProperties = {
      padding: 10,
      border: '2px solid #ff5722',
      borderRadius: 5,
      backgroundColor: '#ffccbc',
      textAlign: 'center',
      width: 150,
      cursor: 'pointer',
    };
    const containerStyle = { ...defaultStyle, ...data.style } as React.CSSProperties;

    if (data.isEditing) {

    return (
      <div style={containerStyle}>
        <Handle type="target" position={Position.Top} />
        <div>
          <strong>{data.name}</strong>
          <br />
          {data.outputFrequency ? `${(data.outputFrequency / 1e6).toFixed(2)} MHz` : ''}
          <br />
          <input
            type="text"
            inputMode="numeric"
            value={data.inputValue}
            onChange={data.onInputChange}
            onKeyDown={data.onInputKeyDown}
            placeholder="Factor"
            autoFocus
            style={{ width: '80px' }}
            />
            {data.error && (
              <div style={{ color: 'red', fontSize: '12px' }}>{data.error}</div>
            )}
        </div>
        <Handle type="source" position={Position.Bottom} />
      </div>
    );
    } else {

    return (
      <div style={containerStyle}>
        <Handle type="target" position={Position.Top} />
        <div>
          <strong>{data.name}</strong>
          <br />
          {data.outputFrequency ? `${(data.outputFrequency / 1e6).toFixed(2)} MHz` : ''}
          <br />
          {data.divisionFactor ? `Divide by ${data.divisionFactor}` : ''}
        </div>
        <Handle type="source" position={Position.Bottom} />
      </div>
    );}
  };

  export interface ClockOutputNode extends ClockNodeData {
    type: 'ClockOutput';
  }

  const ClockOutputNodeComponent: React.FC<{ data: ClockOutputNode }> = ({ data }) => (
    <div style={{
      padding: 10,
      border: '2px solid #9c27b0',
      borderRadius: 5,
      backgroundColor: '#f3e5f5',
      textAlign: 'center',
      width: 150,
      cursor: 'pointer',
    }}>
      <Handle type="target" position={Position.Top} />
      <div>
        <strong>{data.name}</strong>
        <br />
        {data.outputFrequency ? `${(data.outputFrequency / 1e6).toFixed(2)} MHz` : ''}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );

  const nodeTypesMapped: NodeTypes = {
    'PLL': PLLNodeComponent,
    'MUX': MUXNodeComponent,
    'Prescaler': PrescalerNodeComponent,
    'Clock': ClockOutputNodeComponent,
  };

  // ----------------------------------------------------------------------
  // Main ClockTree Component 
  // ----------------------------------------------------------------------

  const propagateClocks = (clocks: ClockNodeData[]) => {
    const nodeMap = new Map<string, ClockNodeData>();
    clocks.forEach(clock => nodeMap.set(clock.id, clock));

    const propagate = (node: ClockNodeData) => {
      if (node.type === 'PLL') {
        node.connections?.forEach(connId => {
          const connectedNode = nodeMap.get(connId);
          if (connectedNode) {
            propagate(connectedNode);
          }
        });
      } else if (node.type === 'MUX') {
        const muxNode = node as MUXNode;
        muxNode.inputFrequencies = muxNode.sources.map(sourceId => {
          const sourceNode = nodeMap.get(sourceId);
          return sourceNode ? sourceNode.outputFrequency : 0;
        });
        const selectedNode = nodeMap.get(muxNode.selected);
        if (selectedNode) {
          muxNode.outputFrequency = selectedNode.outputFrequency;
        }
        muxNode.connections?.forEach(connId => {
          const connectedNode = nodeMap.get(connId);
          if (connectedNode) {
            propagate(connectedNode);
          }
        });
      } else if (node.type === 'Prescaler') {
        const prescalerNode = node as PrescalerNode;
        const sourceClock = clocks.find((c) => c.id === prescalerNode.source);
        const newFreqHz = sourceClock ? sourceClock.outputFrequency / prescalerNode.divisionFactor : 0;
        prescalerNode.outputFrequency = newFreqHz;
        prescalerNode.connections?.forEach(connId => {
          const connectedNode = nodeMap.get(connId);
          if (connectedNode) {
            propagate(connectedNode);
          }
        });
      } else if (node.type === 'Clock') {
        const parentNode = clocks.find((c) => c.connections?.includes(node.id));
        if (parentNode) {
          node.outputFrequency = parentNode.outputFrequency;
        }
      }
    };

    clocks.forEach(node => {
        propagate(node);
    });
  };

  const ClockTree: React.FC = () => {
    const { config, setConfig } = useContext(ConfigurationContext);
    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);

    const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
    const [inputValue, setInputValue] = useState<string>('');
    const [error, setError] = useState<string>('');

    useEffect(() => {
      if (config) {
        propagateClocks(config.clocks);

        const tempNodes: Node[] = config.clocks.map((node) => ({
          id: node.id,
          type: node.type,
          data: {
            ...node,
            isEditing: node.id === editingNodeId,
            inputValue,
            error,
            onInputChange: handleInputChange,
            onInputKeyDown: handleInputKeyDown,
            onBlur: () => { setEditingNodeId(null); setError(''); },
            onSelectChange: handleSelectChange,
          },
          position: { x: 0, y: 0 },
          style: node.style
        }));

        const tempEdges: Edge[] = config.clocks.flatMap((node) => {
          if (node.connections && node.connections.length > 0) {
            return node.connections.map((connId) => {
              const pllData = node as PLLNode;
              const parentFreq = pllData.outputFrequency;
              const tooltip = parentFreq !== undefined ? `${(parentFreq / 1e6).toFixed(2)} MHz` : '';
              return {
                id: `e${node.id}-${connId}`,
                source: node.id,
                target: connId,
                animated: true,
                arrowHeadType: 'arrowclosed',
                label: tooltip,
                labelStyle: { fill: '#666', fontSize: 12 },
                data: { tooltip },
              };
            });
          }
          return [];
        });

        const layouted = getLayoutedElements(tempNodes, tempEdges);
        setNodes(layouted.nodes);
        setEdges(layouted.edges);
        setConfig({ ...config });
      }
    }, [config, setConfig]);

    const handleNodeDoubleClick = (_event: React.MouseEvent, node: Node) => {
      const clicked = config?.clocks.find((clock) => clock.id === node.id);
      if (clicked) {
        setEditingNodeId(node.id);
        if (clicked.type === 'PLL') {
          if (clicked.type === 'PLL') {
            const pllNode = clicked as PLLNode;
            setInputValue((pllNode.outputFrequency! / 1e6).toString()); // MHz
          }
          setError('');
        } else if (clicked.type === 'MUX') {
          const muxNode = clicked as MUXNode;
          setInputValue((muxNode.outputFrequency / 1e6).toString());
        } else if (clicked.type === 'Prescaler') {
          const prescalerNode = clicked as PrescalerNode;
          setInputValue((prescalerNode.divisionFactor).toString());
        }
      }
    };

    const updateClockFrequency = (index: number, newFreq: number) => {
      const updatedClocks = [...config!.clocks];
      const clock = updatedClocks[index];
      clock.outputFrequency = newFreq;

      // switch (clock.type) {
      //   case 'PLL':
      //     // For a PLL node, update its frequency property.
      //     updatedClocks[index] = { ...clock, outputFrequency: newFreq } as PLLNode;
      //     break;
      //   case 'MUX':
      //     // For a MUX node, update its frequency (or you might update a different property if needed).
      //     updatedClocks[index] = { ...clock, outputFrequency: newFreq } as MUXNode;
      //     break;
      //   case 'Prescaler':
      //     // // For a Prescaler node, update frequency and (if needed) the outputFrequency.
      //     // updatedClocks[index] = {
      //     //   ...clock,
      //     //   frequency: newFreq,
      //     //   outputFrequency: newFreq, // Or recalc if necessary.
      //     // } as PrescalerNode;
      //     break;
      //   case 'Clock':
      //     // For a Clock (output) node, update its frequency.
      //     // updatedClocks[index] = { ...clock, frequency: newFreq } as ClockOutputNode;
      //     break;
      //   default:
      //   // Fallback for unknown types.
      //   // updatedClocks[index] = { ...clock, frequency: newFreq };
      // }
      setConfig({ ...config!, clocks: updatedClocks });
    };

    
    const submitInput = () => {
      if (!editingNodeId || !config) return;
      const clockIndex = config.clocks.findIndex((c) => c.id === editingNodeId);
      if (clockIndex === -1) return;

      const clock = config.clocks[clockIndex];
      const newFreqMHz = parseFloat(inputValue);
      if (isNaN(newFreqMHz)) {
        setError('Invalid number');
        return;
      }
      const newFreqHz = newFreqMHz * 1e6;

      if (clock.type === 'PLL') {
        const pllNode = clock as PLLNode;
        if (pllNode.range?.type === 'interval') {
          const { min, max } = pllNode.range;
          if (newFreqHz >= (min || 0) && newFreqHz <= (max || Infinity)) {
            updateClockFrequency(clockIndex, newFreqHz);
            propagateClocks(config.clocks);
            setEditingNodeId(null);
          } else {
            setError(`Frequency must be between ${(min || 0) / 1e6}MHz and ${(max || Infinity) / 1e6}MHz`);
          }
        } else if (pllNode.range?.type === 'list') {
          const validFreqs = pllNode.range.values || [];
          if (validFreqs.includes(newFreqHz)) {
            updateClockFrequency(clockIndex, newFreqHz);
            propagateClocks(config.clocks);
            setEditingNodeId(null);
          } else {
            setError('Frequency not in the predefined list');
          }
        }
      } else if (clock.type === "MUX") {
        updateClockFrequency(clockIndex, newFreqHz);
        propagateClocks(config.clocks);
        setEditingNodeId(null);
      } else if (clock.type === "Prescaler") {
        const prescalerNode = clock as PrescalerNode;
        const divider = parseFloat(inputValue);
        prescalerNode.divisionFactor = divider;
        propagateClocks(config.clocks);
        setEditingNodeId(null);
      }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setInputValue(e.target.value);
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        submitInput();
      } else if (e.key == 'Escape') {
        setEditingNodeId(null);
      }
    };

    const handleSelectChange = (
      e: React.ChangeEvent<HTMLSelectElement>,
      clock: ClockNodeData
    ) => {
      const selected = e.target.value;
      if (!editingNodeId || !config) return;
      const idx = config.clocks.findIndex((c) => c.id === editingNodeId);
      if (idx === -1) return;
      const updated: ClockNodeData[] = config.clocks.map((c) => ({ ...c }));

      if (updated[idx].type === 'MUX') {
        const muxNode = updated[idx] as MUXNode;
        const selectedIndex = muxNode.inputFrequencies?.findIndex(
          (freq) => (freq / 1e6).toFixed(2) === selected
        );
        if (selectedIndex !== undefined && selectedIndex >= 0) {
          muxNode.selected = muxNode.sources[selectedIndex];
          muxNode.outputFrequency = muxNode.inputFrequencies[selectedIndex];
        }
      } else if (updated[idx].type === 'PLL' || updated[idx].type === 'Clock') {
        // For non-MUX types, parse the selected frequency.
        const newFreqHz = parseFloat(selected) * 1e6;
        updated[idx].outputFrequency = newFreqHz;
        
      } else if (updated[idx].type === 'Prescaler') {

      }
      propagateClocks(updated);
      setConfig({ ...config, clocks: updated });
      setEditingNodeId(null);
      setError('');
    };

    return (
      <div style={{ height: '80vh', width: '100%', margin: '0 auto', position: 'relative' }}>
        <ReactFlow
          fitView
          snapToGrid
          snapGrid={[15, 15]}
          nodesConnectable={false}
          elementsSelectable={false}
          nodes={nodes}
          edges={edges}
          onNodeDoubleClick={handleNodeDoubleClick}
          nodeTypes={nodeTypesMapped}
        >
          <Background color="#aaa" gap={16} />
          <MiniMap />
          <Controls />
        </ReactFlow>
      </div>
    );
  };

  export default ClockTree;
