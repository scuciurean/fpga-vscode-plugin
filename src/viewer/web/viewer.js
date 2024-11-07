document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    const gridSize = 100; // Size of the grid cells
    const blockWidth = 250; // Width of blocks
    const portHeight = 30; // Height of each port
    const portMargin = 10; // Margin inside the port area for anchor points
    const horizontalLineExtension = 4; // Extension length for the horizontal segment
    const horizontalLineLength = 50; // Minimum length of the horizontal segment for wire connections
    let modulePositions = {}; // To store module positions
    let blocks = []; // To store blocks for overlap checking
    let draggingBlock = null; // To store the block currently being dragged
    let originalPosition = { x: 0, y: 0 }; // To store original position before dragging
    let modulesData = []; // To store the modules data

    // Create the grid canvas
    const gridCanvas = document.createElement('canvas');
    gridCanvas.width = canvas.clientWidth;
    gridCanvas.height = canvas.clientHeight;
    gridCanvas.style.position = 'absolute';
    gridCanvas.style.top = '0';
    gridCanvas.style.left = '0';
    gridCanvas.style.zIndex = '0';
    canvas.appendChild(gridCanvas);
    const gridCtx = gridCanvas.getContext('2d');

    // Create the connection canvas
    const connectionCanvas = document.createElement('canvas');
    connectionCanvas.width = canvas.clientWidth;
    connectionCanvas.height = canvas.clientHeight;
    connectionCanvas.style.position = 'absolute';
    connectionCanvas.style.top = '0';
    connectionCanvas.style.left = '0';
    connectionCanvas.style.zIndex = '1';
    connectionCanvas.style.pointerEvents = 'none'; // Allow clicks through canvas
    canvas.appendChild(connectionCanvas);
    const connectionCtx = connectionCanvas.getContext('2d');

    // Function to draw the grid on the grid canvas
    function drawGrid() {
        gridCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height); // Clear existing grid
        gridCtx.strokeStyle = '#ddd'; // Grid line color
        gridCtx.lineWidth = 1;

        // Draw horizontal lines
        for (let y = 0; y <= gridCanvas.height; y += gridSize) {
            gridCtx.beginPath();
            gridCtx.moveTo(0, y);
            gridCtx.lineTo(gridCanvas.width, y);
            gridCtx.stroke();
        }

        // Draw vertical lines
        for (let x = 0; x <= gridCanvas.width; x += gridSize) {
            gridCtx.beginPath();
            gridCtx.moveTo(x, 0);
            gridCtx.lineTo(x, gridCanvas.height);
            gridCtx.stroke();
        }
    }

    // drawGrid();

    // Function to snap a value to the nearest grid line
    function snapToGrid(value) {
        return Math.round(value / gridSize) * gridSize;
    }

    // Function to check for overlap with existing blocks
    function isOverlapping(x, y, excludeBlock = null) {
        return blocks.some(block => {
            if (block.element === excludeBlock) {
                return false;
            }
            const bx = block.x;
            const by = block.y;
            return (
                x < bx + blockWidth &&
                x + blockWidth > bx &&
                y < by + block.height &&
                y + block.height > by
            );
        });
    }

    // Function to find the nearest free position on the grid
    function findFreePosition(startX, startY) {
        let x = startX;
        let y = startY;
        while (isOverlapping(x, y, draggingBlock)) {
            x += gridSize;
            if (x + blockWidth > canvas.clientWidth) {
                x = 0;
                y += gridSize;
                if (y + block.height > canvas.clientHeight) {
                    y = 0; // Wrap around if necessary
                }
            }
        }
        return { x, y };
    }

    // Function to arrange module positions to minimize wire overlap
    function arrangeModules(modules) {
        const spacing = 50; // Minimum space between modules
        const arrangedPositions = {};

        // Initial positions for modules
        modules.forEach((module, index) => {
            const x = snapToGrid(spacing + index * (blockWidth + spacing));
            const y = snapToGrid(spacing);

            arrangedPositions[module.instance_name] = { x, y };
        });

        return arrangedPositions;
    }

    // Function to calculate the anchor point for a port
    function getPortAnchorPoint(block, portElement) {
        const blockRect = block.getBoundingClientRect();
        const portRect = portElement.getBoundingClientRect();
        const relativeX = parseFloat(block.style.left) + blockWidth; // Margin inside the block
        const relativeY = parseFloat(block.style.top) + portElement.offsetTop + portMargin + (portElement.offsetHeight / 2); // Center of the port vertically

        return { x: relativeX, y: relativeY };
    }

    // Function to draw connections between ports with the same wire_name
    function drawWires() {
        connectionCtx.clearRect(0, 0, connectionCanvas.width, connectionCanvas.height); // Clear previous connections

        const wireMap = {}; // Map of wire_name to array of anchor points

        // Collect all anchor points grouped by wire_name
        modulesData.forEach(module => {
            const block = canvas.querySelector(`.module-block[data-module="${module.instance_name}"]`);
            if (!block) {
                return;
            }

            const portElements = block.querySelectorAll('.port');
            portElements.forEach(portElement => {
                const wireName = portElement.dataset.wireName;

                if (wireName) {
                    if (!wireMap[wireName]) {
                        wireMap[wireName] = [];
                    }
                    const anchor = getPortAnchorPoint(block, portElement);
                    wireMap[wireName].push(anchor);
                }
            });
        });

        // Draw wires as L-shaped lines with minimum horizontal segment length
        for (const wireName in wireMap) {
            const anchors = wireMap[wireName];
            if (anchors.length < 2) {
                continue;
            }

            for (let i = 0; i < anchors.length - 1; i++) {
                const start = anchors[i];
                const end = anchors[i + 1];

                // Horizontal segment to the right of the start anchor point
                const horizontalStartX = start.x + horizontalLineExtension;
                const horizontalStartY = start.y;

                // Vertical segment to the right of the end anchor point
                const horizontalEndX = end.x - horizontalLineExtension;
                const horizontalEndY = end.y;

                connectionCtx.beginPath();
                connectionCtx.moveTo(horizontalStartX, horizontalStartY);

                // Draw horizontal segment to the right
                connectionCtx.lineTo(horizontalStartX + horizontalLineLength, horizontalStartY);

                // Draw vertical segment
                connectionCtx.lineTo(horizontalStartX + horizontalLineLength, horizontalEndY);

                // Draw final horizontal segment to the end anchor point
                connectionCtx.lineTo(horizontalEndX, horizontalEndY);

                connectionCtx.stroke();
            }
        }

        // Draw colored circles at each anchor point
        for (const wireName in wireMap) {
            const anchors = wireMap[wireName];
            anchors.forEach(anchor => {
                connectionCtx.beginPath();
                connectionCtx.arc(anchor.x, anchor.y, 5, 0, 2 * Math.PI); // Radius of 5
                connectionCtx.fillStyle = '#f00'; // Red color for the circle
                connectionCtx.fill();
                connectionCtx.strokeStyle = '#000'; // Black border for the circle
                connectionCtx.stroke();
            });
        }
    }

    // Function to render modules
    function renderModules(modules) {
        // Clear existing modules
        const existingBlocks = canvas.querySelectorAll('.module-block');
        existingBlocks.forEach(block => block.remove());

        modulePositions = {}; // Reset positions for new render
        blocks = []; // Reset blocks for new render
        draggingBlock = null; // Reset dragging block
        modulesData = modules; // Update global modules data

        // Arrange modules to minimize wire overlap
        modulePositions = arrangeModules(modules);

        modules.forEach(module => {
            // Calculate block height based on number of ports
            const blockHeight = Math.max(portHeight * module.ports.length + portMargin * (module.ports.length - 1), 150); // Minimum height of 150

            // Initial position for the module
            const { x, y } = modulePositions[module.instance_name];

            // Create block for the module
            const block = document.createElement('div');
            block.classList.add('module-block');
            block.style.left = `${x}px`;
            block.style.top = `${y}px`;
            block.style.width = `${blockWidth}px`;
            block.style.height = `${blockHeight}px`;
            block.dataset.module = module.instance_name;

            // Create ports, assuming ports are in the format 'port_name(wire_name)'
            block.innerHTML = `
                <div class="block-header">
                    <strong>${module.instance_name}</strong>
                </div>
                <div class="block-ports">
                    ${module.ports.map(port => {
                        const wireName = getWireName(port);
                        const portName = getPortName(port);
                        return `<div class="port" data-port-name="${portName}" data-wire-name="${wireName}">${portName}</div>`;
                    }).join('')}
                </div>
            `;

            canvas.appendChild(block);
            blocks.push({ x, y, element: block, height: blockHeight }); // Add block to the list of blocks

            // Make blocks draggable and snap to grid
            block.addEventListener('mousedown', (e) => {
                if (e.target.classList.contains('port')) {
                    return; // Do not initiate drag when clicking on a port
                }
                e.preventDefault(); // Prevent text selection
                draggingBlock = block;
                isDragging = true;
                initialMouseX = e.clientX;
                initialMouseY = e.clientY;
                initialBlockX = parseFloat(block.style.left);
                initialBlockY = parseFloat(block.style.top);
                originalPosition = { x: initialBlockX, y: initialBlockY };
                block.style.zIndex = '1000'; // Bring block to the front
                block.style.cursor = 'grabbing'; // Change cursor to grabbing

                // Temporarily remove the block from overlap checking
                blocks = blocks.filter(b => b.element !== block);
            });
        });

        // Redraw wires after rendering modules
        drawWires();
    }

    // Helper function to extract wireName from port string 'port_name(wire_name)'
    function getWireName(port) {
        const match = port.match(/\(([^)]+)\)/);
        return match ? match[1].trim() : '';
    }

    // Helper function to extract portName from port string 'port_name(wire_name)'
    function getPortName(port) {
        const match = port.match(/^([^(]+)\(/);
        return match ? match[1].trim() : port.trim();
    }

    // Add global event listeners for dragging
    let isDragging = false;
    let initialMouseX = 0;
    let initialMouseY = 0;
    let initialBlockX = 0;
    let initialBlockY = 0;

    document.addEventListener('mousemove', (e) => {
        if (isDragging && draggingBlock) {
            const deltaX = e.clientX - initialMouseX;
            const deltaY = e.clientY - initialMouseY;
            let newX = initialBlockX + deltaX;
            let newY = initialBlockY + deltaY;

            // Snap to grid
            newX = snapToGrid(newX);
            newY = snapToGrid(newY);

            draggingBlock.style.left = `${newX}px`;
            draggingBlock.style.top = `${newY}px`;
        }
    });

    document.addEventListener('mouseup', (e) => {
        if (isDragging && draggingBlock) {
            isDragging = false;
            draggingBlock.style.zIndex = ''; // Reset zIndex
            draggingBlock.style.cursor = 'grab'; // Reset cursor

            const newX = snapToGrid(parseFloat(draggingBlock.style.left));
            const newY = snapToGrid(parseFloat(draggingBlock.style.top));

            // Check if the position has actually changed
            if (originalPosition.x !== newX || originalPosition.y !== newY) {
                const { x: snappedX, y: snappedY } = findFreePosition(newX, newY);
                draggingBlock.style.left = `${snappedX}px`;
                draggingBlock.style.top = `${snappedY}px`;
                const moduleName = draggingBlock.dataset.module;
                modulePositions[moduleName] = { x: snappedX, y: snappedY };

                // Update the blocks list
                blocks.push({ x: snappedX, y: snappedY, element: draggingBlock });

                // Redraw wires
                drawWires();
            } else {
                // If the block hasn't moved, reset its position
                draggingBlock.style.left = `${originalPosition.x}px`;
                draggingBlock.style.top = `${originalPosition.y}px`;
                const moduleName = draggingBlock.dataset.module;
                modulePositions[moduleName] = { x: originalPosition.x, y: originalPosition.y };
                blocks.push({ x: originalPosition.x, y: originalPosition.y, element: draggingBlock });
            }

            // Reset dragging state
            draggingBlock = null;
        }
    });

    // Function to handle messages from the TypeScript code
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'renderSingleModule':
                renderModules([message.data]);
                break;
            case 'renderSubmodules':
                renderModules(message.data);
                break;
        }
    });

    // Initial draw
    // If needed, you can add initialization code here
});

window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
        case 'refresh':
            // Handle the refresh command
            console.log('Refreshing the viewer');
            // Update the content here with message.data
            break;
        case 'renderSingleModule':
            // Render a single module
            break;
        case 'renderSubmodules':
            // Render multiple submodules
            break;
    }
});
