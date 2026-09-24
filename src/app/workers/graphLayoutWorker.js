import dagre from 'dagre';

const getLayoutedElements = (nodes, edges, direction = 'TB') => {
    const dagreGraph = new dagre.graphlib.Graph({ compound: true });
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    dagreGraph.setGraph({ rankdir: direction, align: 'UL', ranksep: 60, nodesep: 40 });

    nodes.forEach((node) => {
        if (node.type !== 'customGroup') {
            dagreGraph.setNode(node.id, { width: 180, height: 60 });
        } else {
            dagreGraph.setNode(node.id, {});
        }
    });

    nodes.forEach((node) => {
        if (node.parentId && dagreGraph.hasNode(node.parentId)) {
            dagreGraph.setParent(node.id, node.parentId);
        }
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    try {
        dagre.layout(dagreGraph);
    } catch (e) {
        console.error("Dagre layout error", e);
    }

    nodes.forEach((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        if (!nodeWithPosition) return;

        node.targetPosition = direction === 'LR' ? 'left' : 'top';
        node.sourcePosition = direction === 'LR' ? 'right' : 'bottom';

        if (node.type === 'customGroup') {
            node.style = {
                width: nodeWithPosition.width || 200,
                height: nodeWithPosition.height || 100,
                backgroundColor: 'transparent',
            };
            node.position = {
                x: nodeWithPosition.x - (nodeWithPosition.width || 200) / 2,
                y: nodeWithPosition.y - (nodeWithPosition.height || 100) / 2,
            };
        } else {
            let xOffset = 0;
            let yOffset = 0;
            if (node.parentId) {
                const parent = dagreGraph.node(node.parentId);
                if (parent) {
                    xOffset = parent.x - parent.width / 2;
                    yOffset = parent.y - parent.height / 2;
                }
            }

            node.position = {
                x: (nodeWithPosition.x - 90) - xOffset,
                y: (nodeWithPosition.y - 30) - yOffset,
            };
        }
        return node;
    });

    return { nodes, edges };
};

const detectCycles = (nodes, edges) => {
    const adj = {};
    nodes.forEach(n => adj[n.id] = []);
    edges.forEach(e => {
        if (!adj[e.source]) adj[e.source] = [];
        adj[e.source].push(e);
    });

    const visited = new Set();
    const recStack = new Set();
    const cycleEdges = new Set();

    const dfs = (nodeId) => {
        visited.add(nodeId);
        recStack.add(nodeId);

        for (const edge of (adj[nodeId] || [])) {
            if (!visited.has(edge.target)) {
                dfs(edge.target);
            } else if (recStack.has(edge.target)) {
                cycleEdges.add(edge.id);
            }
        }
        recStack.delete(nodeId);
    };

    for (const n of nodes) {
        if (!visited.has(n.id)) dfs(n.id);
    }

    return cycleEdges;
};

const findBfsPath = (startId, endId, activeNodeIds, activeEdges) => {
    const adj = {};
    activeNodeIds.forEach(id => adj[id] = []);
    activeEdges.forEach(e => {
        if (adj[e.source]) adj[e.source].push(e);
    });

    const queue = [startId];
    const cameFrom = { [startId]: null };

    while (queue.length > 0) {
        const curr = queue.shift();
        if (curr === endId) break;

        for (const edge of (adj[curr] || [])) {
            if (cameFrom[edge.target] === undefined) {
                cameFrom[edge.target] = { node: curr, edge: edge.id };
                queue.push(edge.target);
            }
        }
    }

    const pathNodes = new Set();
    const pathEdges = new Set();

    if (cameFrom[endId] !== undefined) {
        let curr = endId;
        while (curr !== null) {
            pathNodes.add(curr);
            const prev = cameFrom[curr];
            if (prev && prev.edge) pathEdges.add(prev.edge);
            curr = prev ? prev.node : null;
        }
    }
    return { pathNodes, pathEdges };
};

self.onmessage = (event) => {
    const {
        rawGraph,
        searchQuery,
        filterLayer,
        collapsedGroupsArray,
        selectedNodeId,
        targetNodeId
    } = event.data;

    const collapsedGroups = new Set(collapsedGroupsArray);

    if (!rawGraph.nodes || rawGraph.nodes.length === 0) {
        self.postMessage({ type: 'DONE', payload: { nodes: [], edges: [], cycleEdges: Array.from(new Set()) } });
        return;
    }

    // Detect cycles overall
    const cycles = detectCycles(rawGraph.nodes, rawGraph.edges);

    let filteredNodes = rawGraph.nodes;
    if (searchQuery) filteredNodes = filteredNodes.filter(n => n.label.toLowerCase().includes(searchQuery.toLowerCase()) || n.type === 'group');
    if (filterLayer) filteredNodes = filteredNodes.filter(n => n.type === filterLayer || n.type === 'group');

    const getVisibleTopmost = (nodeId) => {
        let curr = filteredNodes.find(n => n.id === nodeId);
        let topmost = curr ? curr.id : nodeId;
        while (curr && curr.parentId) {
            if (collapsedGroups.has(curr.parentId)) topmost = curr.parentId;
            curr = filteredNodes.find(n => n.id === curr.parentId);
        }
        return topmost;
    };

    // Filter out children of collapsed groups
    const activeNodesMap = new Map();
    filteredNodes.forEach(n => {
        let isHidden = false;
        let curr = n.parentId;
        while (curr) {
            if (collapsedGroups.has(curr)) { isHidden = true; break; }
            const p = filteredNodes.find(x => x.id === curr);
            curr = p ? p.parentId : null;
        }
        if (!isHidden) activeNodesMap.set(n.id, n);
    });

    // Auto-remove empty groups if no children exist in graph (but keep them if they are collapsed)
    const activeNodeArray = Array.from(activeNodesMap.values());
    const usedParents = new Set(activeNodeArray.map(n => n.parentId).filter(Boolean));
    const activeSet = new Set();
    activeNodeArray.forEach(n => {
        if (n.type !== 'group' || usedParents.has(n.id) || collapsedGroups.has(n.id)) {
            activeSet.add(n.id);
        }
    });

    const activeNodes = activeNodeArray.filter(n => activeSet.has(n.id));
    const activeEdgesMap = new Map();

    rawGraph.edges.forEach(e => {
        // Find new source/target based on collapse state
        const { source, target } = e;
        if (activeNodesMap.has(source) || activeNodesMap.has(target)) { // At least one was in search scope originally
            const newSource = getVisibleTopmost(source);
            const newTarget = getVisibleTopmost(target);
            if (newSource !== newTarget && activeSet.has(newSource) && activeSet.has(newTarget)) {
                const key = `${newSource}-${newTarget}`;
                if (!activeEdgesMap.has(key)) {
                    activeEdgesMap.set(key, { ...e, id: `edge_${newSource}_${newTarget}`, source: newSource, target: newTarget });
                }
            }
        }
    });

    const activeEdges = Array.from(activeEdgesMap.values());

    // Highlight tracking
    let highlightedNodes = new Set();
    let highlightedEdges = new Set();
    const hasSelection = selectedNodeId !== null;

    if (selectedNodeId && targetNodeId) {
        // Path tracking
        const { pathNodes, pathEdges } = findBfsPath(selectedNodeId, targetNodeId, activeSet, activeEdges);
        highlightedNodes = pathNodes;
        highlightedEdges = pathEdges;
    } else if (selectedNodeId) {
        highlightedNodes.add(selectedNodeId);
        activeEdges.forEach(e => {
            if (e.source === selectedNodeId) {
                highlightedNodes.add(e.target);
                highlightedEdges.add(e.id);
            }
            if (e.target === selectedNodeId) {
                highlightedNodes.add(e.source);
                highlightedEdges.add(e.id);
            }
        });
    }

    const flowNodes = activeNodes.map(n => {
        const dimmed = hasSelection && !highlightedNodes.has(n.id);

        return {
            id: n.id,
            type: n.type === 'group' ? 'customGroup' : 'custom',
            parentId: n.parentId && activeSet.has(n.parentId) ? n.parentId : undefined,
            position: { x: 0, y: 0 },
            data: {
                id: n.id,
                label: n.label,
                type: n.type,
                language: n.language,
                filePath: n.filePath,
                collapsed: collapsedGroups.has(n.id),
                dimmed
            }
        };
    });

    const flowEdges = activeEdges.map(e => {
        const isCycle = cycles.has(e.id) || cycles.has(rawGraph.edges.find(re => re.source === e.source && re.target === e.target)?.id);
        const isHighlighted = hasSelection && highlightedEdges.has(e.id);
        const dimmed = hasSelection && !isHighlighted;

        let strokeColor = e.dashed ? 'rgba(124, 58, 237, 0.4)' : 'rgba(124, 58, 237, 0.6)';
        if (isCycle) strokeColor = 'rgba(239, 68, 68, 0.8)';
        if (isHighlighted) strokeColor = 'rgba(56, 189, 248, 1)';

        const width = isHighlighted ? 3 : (isCycle ? 2 : 1);

        let strokeOpacity = dimmed ? 0.1 : 1.0;

        return {
            id: e.id,
            source: e.source,
            target: e.target,
            label: !dimmed ? (isCycle ? 'CYCLE: ' + e.label : e.label) : '',
            animated: e.animated || isHighlighted,
            style: {
                stroke: strokeColor,
                strokeDasharray: e.dashed ? "5 5" : undefined,
                strokeWidth: width,
                opacity: strokeOpacity,
                transition: 'all 0.3s'
            }
        };
    });

    let layoutedNodes = [];
    let layoutedEdges = [];

    try {
        const layouted = getLayoutedElements(flowNodes, flowEdges);
        layoutedNodes = layouted.nodes;
        layoutedEdges = layouted.edges;
    } catch (error) {
        console.error("Worker layout error:", error);
        layoutedNodes = flowNodes;
        layoutedEdges = flowEdges;
    }

    self.postMessage({
        type: 'DONE',
        payload: {
            nodes: layoutedNodes,
            edges: layoutedEdges,
            cycleEdges: Array.from(cycles)
        }
    });
};
