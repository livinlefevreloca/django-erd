/* ERD interactive viewer — graph with collapsible detail panel */

// --- State ---
let cy = null;
let selectedModelId = graphData.centralNode;
let panelOpen = true;
let currentDepth = 0;       // 0 = show all
let currentDirection = 'both'; // 'both', 'references', 'referencedBy'
let currentSpread = 7;       // 1–10
let excludedEdges = new Set(); // indices of specific edges to exclude

// --- Lookup maps ---
const nodeMap = {};
graphData.nodes.forEach(n => { nodeMap[n.id] = n; });

// Adjacency lists
const outgoing = {}; // source → [{ nodeId, edgeIdx }]
const incoming = {}; // target → [{ nodeId, edgeIdx }]
graphData.nodes.forEach(n => { outgoing[n.id] = []; incoming[n.id] = []; });
graphData.edges.forEach((e, i) => {
    outgoing[e.source].push({ nodeId: e.target, edgeIdx: i });
    incoming[e.target].push({ nodeId: e.source, edgeIdx: i });
});

// Cytoscape style definitions (constant)
const cyStyles = [
    {
        selector: 'node',
        style: {
            'label': 'data(label)',
            'background-color': '#1a1d27',
            'border-color': '#3a3f55',
            'border-width': 2,
            'color': '#e1e4ed',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '11px',
            'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
            'width': 'label',
            'height': 40,
            'padding': '14px',
            'shape': 'round-rectangle',
            'text-wrap': 'wrap',
            'text-max-width': '200px',
            'line-height': 1.4,
        }
    },
    {
        selector: 'node.highlighted',
        style: {
            'background-color': 'rgba(108, 140, 255, 0.2)',
            'border-color': '#6c8cff',
            'border-width': 3,
            'color': '#ffffff',
            'font-weight': 'bold',
        }
    },
    {
        selector: 'node.neighbor',
        style: {
            'border-color': '#5570b8',
            'border-width': 2,
        }
    },
    {
        selector: 'edge',
        style: {
            'width': 1.5,
            'line-color': '#3a3f55',
            'target-arrow-color': '#3a3f55',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 0.8,
            'label': 'data(label)',
            'font-size': '10px',
            'color': '#b0b4c8',
            'text-background-color': '#0f1117',
            'text-background-opacity': 0.85,
            'text-background-padding': '3px',
            'text-background-shape': 'round-rectangle',
            'text-rotation': 'autorotate',
            'text-margin-y': -12,
            'font-family': '"SF Mono", "Fira Code", monospace',
        }
    },
    {
        selector: 'edge[relType = "fk"]',
        style: { 'line-color': '#a4c4e0', 'target-arrow-color': '#a4c4e0' }
    },
    {
        selector: 'edge[relType = "o2o"]',
        style: { 'line-color': '#a0d4cc', 'target-arrow-color': '#a0d4cc', 'line-style': 'dashed' }
    },
    {
        selector: 'edge[relType = "m2m"]',
        style: { 'line-color': '#caa8d8', 'target-arrow-color': '#caa8d8', 'target-arrow-shape': 'diamond' }
    },
    {
        selector: 'edge.neighbor',
        style: { 'width': 2.5, 'z-index': 1 }
    },
];

// --- Panel ---

function togglePanel() {
    const panel = document.getElementById('detail-panel');
    const expandBtn = document.getElementById('panel-expand-btn');
    panelOpen = !panelOpen;
    panel.classList.toggle('collapsed', !panelOpen);
    expandBtn.classList.toggle('hidden', panelOpen);
    setTimeout(() => { if (cy) cy.resize(); }, 220);
}

// --- Model search list ---

function buildModelList() {
    const list = document.getElementById('model-list');
    const sorted = [...graphData.nodes].sort((a, b) => a.label.localeCompare(b.label));
    sorted.forEach(node => {
        const li = document.createElement('li');
        li.dataset.modelId = node.id;
        li.innerHTML = `${node.label}<span class="app-label">${node.app}</span>`;
        li.onclick = () => selectModel(node.id);
        li.classList.add('hidden');
        list.appendChild(li);
    });
}

function filterModels(query) {
    const items = document.querySelectorAll('#model-list li');
    const q = query.toLowerCase();
    items.forEach(li => {
        if (!q) {
            li.classList.add('hidden');
        } else {
            const text = li.textContent.toLowerCase();
            li.classList.toggle('hidden', !text.includes(q));
        }
    });
}

// --- Graph filtering ---

function getVisibleNodeIds() {
    if (currentDepth === 0 || !selectedModelId) {
        return new Set(graphData.nodes.map(n => n.id));
    }

    const visited = new Set([selectedModelId]);
    let frontier = [selectedModelId];

    for (let d = 0; d < currentDepth; d++) {
        const next = [];
        for (const nid of frontier) {
            const neighbors = [];
            if (currentDirection === 'both' || currentDirection === 'references') {
                for (const x of (outgoing[nid] || [])) {
                    if (!excludedEdges.has(x.edgeIdx)) {
                        neighbors.push(x.nodeId);
                    }
                }
            }
            if (currentDirection === 'both' || currentDirection === 'referencedBy') {
                for (const x of (incoming[nid] || [])) {
                    if (!excludedEdges.has(x.edgeIdx)) {
                        neighbors.push(x.nodeId);
                    }
                }
            }
            for (const n of neighbors) {
                if (!visited.has(n)) {
                    visited.add(n);
                    next.push(n);
                }
            }
        }
        frontier = next;
        if (frontier.length === 0) break;
    }

    return visited;
}

function buildElements(visibleIds) {
    const elements = [];
    for (const node of graphData.nodes) {
        if (!visibleIds.has(node.id)) continue;
        elements.push({
            data: {
                id: node.id,
                label: `${node.label}\n${node.app}`,
                modelName: node.label,
                app: node.app,
                fieldCount: node.fields.length,
            }
        });
    }
    graphData.edges.forEach((edge, i) => {
        if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) return;
        if (excludedEdges.has(i)) return;
        elements.push({
            data: {
                id: `e${i}`,
                source: edge.source,
                target: edge.target,
                label: edge.field,
                relType: edge.type,
            }
        });
    });
    return elements;
}

// --- Cytoscape ---

function renderGraph() {
    const visibleIds = getVisibleNodeIds();
    const elements = buildElements(visibleIds);

    if (cy) { cy.destroy(); cy = null; }

    cy = cytoscape({
        container: document.getElementById('cy'),
        elements: elements,
        style: cyStyles,
        layout: {
            name: 'cose',
            animate: false,
            fit: false,
            idealEdgeLength: function() { return 300; },
            nodeRepulsion: function() { return 500000; },
            nodeOverlap: 40,
            gravity: 0.1,
            numIter: 2000,
            padding: 50,
        },
        minZoom: 0.01,
        maxZoom: 6,
        wheelSensitivity: 0.3,
    });

    // Post-process: scale positions by spread factor.
    // fit() afterwards keeps it in viewport but nodes appear smaller
    // relative to spacing at higher factors — giving visual "spread".
    const factor = currentSpread * 0.4; // 1→0.4x, 7→2.8x, 20→8x
    if (Math.abs(factor - 1.0) > 0.01) {
        const bb = cy.nodes().boundingBox();
        const centerX = (bb.x1 + bb.x2) / 2;
        const centerY = (bb.y1 + bb.y2) / 2;
        cy.nodes().positions(function(node) {
            const pos = node.position();
            return {
                x: centerX + (pos.x - centerX) * factor,
                y: centerY + (pos.y - centerY) * factor,
            };
        });
    }
    cy.fit(50);

    cy.on('tap', 'node', evt => selectModel(evt.target.id()));

    // Highlight selected
    if (selectedModelId) {
        const node = cy.getElementById(selectedModelId);
        if (node.length) {
            node.addClass('highlighted');
            node.neighborhood().addClass('neighbor');
        }
        setTimeout(() => centerOnNode(selectedModelId), 100);
    }
}

function centerOnNode(nodeId) {
    if (!cy) return;
    const node = cy.getElementById(nodeId);
    if (node.length) {
        cy.animate({ center: { eles: node }, zoom: 1.5 }, { duration: 300 });
    }
}

// --- Selection ---

function selectModel(modelId) {
    selectedModelId = modelId;
    const model = nodeMap[modelId];
    if (!model) return;

    // Update panel header
    document.getElementById('panel-model-name').textContent = model.label;
    document.getElementById('panel-model-meta').textContent = `${model.app}.${model.label} — ${model.dbTable}`;

    // Clear search and hide results
    document.getElementById('model-search').value = '';
    filterModels('');

    // Render detail + populate exclude dropdown
    renderModelDetail(modelId);
    populateExcludeDropdown(modelId);

    // Open panel if collapsed
    if (!panelOpen) togglePanel();

    // Re-render graph when depth is active, otherwise just highlight
    if (currentDepth > 0) {
        renderGraph();
    } else if (cy) {
        cy.elements().removeClass('highlighted neighbor');
        const node = cy.getElementById(modelId);
        if (node.length) {
            node.addClass('highlighted');
            node.neighborhood().addClass('neighbor');
            centerOnNode(modelId);
        }
    }
}

function renderModelDetail(modelId) {
    const model = nodeMap[modelId];
    if (!model) return;

    const detail = document.getElementById('model-detail');
    const incomingEdgesForModel = graphData.edges.filter(e => e.target === modelId);
    const relationFields = model.fields.filter(f => f.isRelation);

    // --- Fields table (Field + Related To, tooltip for type/badges) ---
    let html = `
        <table class="fields-table">
            <thead><tr><th>Field</th><th>Related To</th></tr></thead>
            <tbody>
    `;

    model.fields.forEach(f => {
        const tipParts = [f.type + (f.maxLength ? `(${f.maxLength})` : '')];
        if (f.pk) tipParts.push('PK');
        if (f.isRelation && f.relationType === 'fk') tipParts.push('FK');
        if (f.isRelation && f.relationType === 'o2o') tipParts.push('O2O');
        if (f.isRelation && f.relationType === 'm2m') tipParts.push('M2M');
        if (f.nullable) tipParts.push('NULL');
        const tooltip = tipParts.join(' \u00b7 ');

        const nameClass = f.pk ? 'field-name pk' : 'field-name';
        let relatedHtml = '';
        if (f.isRelation && f.relatedModel && nodeMap[f.relatedModel]) {
            relatedHtml = `<a class="relation-link" onclick="selectModel('${f.relatedModel}')">${nodeMap[f.relatedModel].label}</a>`;
        }

        html += `<tr data-tooltip="${tooltip}"><td class="${nameClass}">${f.name}</td><td>${relatedHtml}</td></tr>`;
    });

    html += '</tbody></table>';

    // --- Referenced By ---
    if (incomingEdgesForModel.length > 0) {
        html += `<div class="relations-section"><h3>Referenced By</h3><div class="relation-cards">`;
        incomingEdgesForModel.forEach(edge => {
            const sourceNode = nodeMap[edge.source];
            if (!sourceNode) return;
            const typeLabel = { fk: 'FK', o2o: 'O2O', m2m: 'M2M' }[edge.type] || edge.type;
            html += `
                <div class="relation-card" onclick="selectModel('${edge.source}')">
                    <span class="rel-direction">&larr;</span>
                    <span class="rel-model">${sourceNode.label}</span>
                    <span class="rel-field">.${edge.field} (${typeLabel})</span>
                </div>`;
        });
        html += '</div></div>';
    }

    // --- References ---
    if (relationFields.length > 0) {
        html += `<div class="relations-section"><h3>References</h3><div class="relation-cards">`;
        relationFields.forEach(f => {
            if (!f.relatedModel || !nodeMap[f.relatedModel]) return;
            const targetNode = nodeMap[f.relatedModel];
            const typeLabel = { fk: 'FK', o2o: 'O2O', m2m: 'M2M' }[f.relationType] || f.relationType;
            html += `
                <div class="relation-card" onclick="selectModel('${f.relatedModel}')">
                    <span class="rel-direction">&rarr;</span>
                    <span class="rel-model">${targetNode.label}</span>
                    <span class="rel-field">.${f.name} (${typeLabel})</span>
                </div>`;
        });
        html += '</div></div>';
    }

    detail.innerHTML = html;
}

// --- Controls ---

function setDepth(val) {
    currentDepth = parseInt(val) || 0;
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.disabled = currentDepth === 0;
    });
    renderGraph();
}

function setDirection(dir) {
    currentDirection = dir;
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.dir === dir);
    });
    if (currentDepth > 0) renderGraph();
}

// --- Exclude Refs dropdown ---

function toggleDropdown() {
    document.getElementById('exclude-refs-dropdown').classList.toggle('open');
}

function populateExcludeDropdown(modelId) {
    const menu = document.querySelector('#exclude-refs-dropdown .dropdown-menu');
    menu.innerHTML = '';
    if (!modelId) return;

    const outEdges = (outgoing[modelId] || []);
    const inEdges = (incoming[modelId] || []);

    if (outEdges.length === 0 && inEdges.length === 0) {
        menu.innerHTML = '<span class="dropdown-empty">No relationships</span>';
        return;
    }

    function addEdgeItem(edgeIdx, label) {
        const el = document.createElement('label');
        el.className = 'dropdown-item';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = excludedEdges.has(edgeIdx);
        cb.onchange = function() {
            if (this.checked) {
                excludedEdges.add(edgeIdx);
            } else {
                excludedEdges.delete(edgeIdx);
            }
            updateExcludeToggleLabel();
            renderGraph();
        };
        el.appendChild(cb);
        el.append(` ${label}`);
        menu.appendChild(el);
    }

    if (outEdges.length > 0) {
        const header = document.createElement('div');
        header.className = 'dropdown-header';
        header.textContent = 'References';
        menu.appendChild(header);
        outEdges.forEach(({ edgeIdx }) => {
            const edge = graphData.edges[edgeIdx];
            const targetNode = nodeMap[edge.target];
            if (!targetNode) return;
            const typeLabel = { fk: 'FK', o2o: 'O2O', m2m: 'M2M' }[edge.type] || edge.type;
            addEdgeItem(edgeIdx, `→ ${targetNode.label}.${edge.field} (${typeLabel})`);
        });
    }

    if (inEdges.length > 0) {
        const header = document.createElement('div');
        header.className = 'dropdown-header';
        header.textContent = 'Referenced By';
        menu.appendChild(header);
        inEdges.forEach(({ edgeIdx }) => {
            const edge = graphData.edges[edgeIdx];
            const sourceNode = nodeMap[edge.source];
            if (!sourceNode) return;
            const typeLabel = { fk: 'FK', o2o: 'O2O', m2m: 'M2M' }[edge.type] || edge.type;
            addEdgeItem(edgeIdx, `← ${sourceNode.label}.${edge.field} (${typeLabel})`);
        });
    }
}

function updateExcludeToggleLabel() {
    const btn = document.querySelector('#exclude-refs-dropdown .dropdown-toggle');
    btn.textContent = excludedEdges.size ? `${excludedEdges.size} hidden` : 'None';
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
    const dd = document.getElementById('exclude-refs-dropdown');
    if (dd && !dd.contains(e.target)) {
        dd.classList.remove('open');
    }
});

let _spreadTimer = null;
function debouncedSetSpread(val) {
    currentSpread = parseInt(val) || 7;
    clearTimeout(_spreadTimer);
    _spreadTimer = setTimeout(() => renderGraph(), 300);
}

function setSpread(val) {
    currentSpread = parseInt(val) || 7;
    renderGraph();
}

// --- Init ---
buildModelList();
renderGraph();
// Select central node (detail panel only, graph already rendered)
const initModel = nodeMap[graphData.centralNode];
if (initModel) {
    document.getElementById('panel-model-name').textContent = initModel.label;
    document.getElementById('panel-model-meta').textContent = `${initModel.app}.${initModel.label} — ${initModel.dbTable}`;
    renderModelDetail(graphData.centralNode);
}
