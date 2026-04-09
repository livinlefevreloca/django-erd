/* ERD interactive viewer — graph with collapsible detail panel */

// --- State ---
let cy = null;
let selectedModelId = null;
let panelOpen = true;

// Build lookup maps
const nodeMap = {};
graphData.nodes.forEach(n => { nodeMap[n.id] = n; });

// Compute incoming relations for each model (reverse edges)
const incomingEdges = {};
graphData.nodes.forEach(n => { incomingEdges[n.id] = []; });
graphData.edges.forEach(e => {
    if (incomingEdges[e.target]) {
        incomingEdges[e.target].push(e);
    }
});

// --- Panel ---

function togglePanel() {
    const panel = document.getElementById('detail-panel');
    const expandBtn = document.getElementById('panel-expand-btn');
    panelOpen = !panelOpen;
    panel.classList.toggle('collapsed', !panelOpen);
    expandBtn.classList.toggle('hidden', panelOpen);
    // Let Cytoscape reclaim the space
    setTimeout(() => { if (cy) cy.resize(); }, 220);
}

// --- Model List ---

function buildModelList() {
    const list = document.getElementById('model-list');
    const sorted = [...graphData.nodes].sort((a, b) => {
        if (a.id === graphData.centralNode) return -1;
        if (b.id === graphData.centralNode) return 1;
        return a.label.localeCompare(b.label);
    });

    sorted.forEach(node => {
        const li = document.createElement('li');
        li.dataset.modelId = node.id;
        li.innerHTML = `${node.label}<span class="app-label">${node.app}</span>`;
        li.onclick = () => selectModel(node.id);
        list.appendChild(li);
    });
}

function filterModels(query) {
    const items = document.querySelectorAll('#model-list li');
    const q = query.toLowerCase();
    items.forEach(li => {
        const text = li.textContent.toLowerCase();
        li.classList.toggle('hidden', q && !text.includes(q));
    });
}

// --- Selection ---

function selectModel(modelId) {
    selectedModelId = modelId;
    const model = nodeMap[modelId];
    if (!model) return;

    // Update panel header
    document.getElementById('panel-model-name').textContent = model.label;
    document.getElementById('panel-model-meta').textContent = `${model.app}.${model.label} — ${model.dbTable}`;

    // Update sidebar selection
    document.querySelectorAll('#model-list li').forEach(li => {
        li.classList.toggle('active', li.dataset.modelId === modelId);
    });
    const activeLi = document.querySelector('#model-list li.active');
    if (activeLi) activeLi.scrollIntoView({ block: 'nearest' });

    // Render detail
    renderModelDetail(modelId);

    // Open panel if collapsed
    if (!panelOpen) togglePanel();

    // Sync with Cytoscape
    if (cy) {
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
    const incoming = incomingEdges[modelId] || [];
    const relationFields = model.fields.filter(f => f.isRelation);

    let html = `
        <table class="fields-table">
            <thead>
                <tr>
                    <th>Field</th>
                    <th>Type</th>
                    <th></th>
                    <th>Related To</th>
                </tr>
            </thead>
            <tbody>
    `;

    model.fields.forEach(f => {
        const badges = [];
        if (f.pk) badges.push('<span class="badge badge-pk">PK</span>');
        if (f.isRelation && f.relationType === 'fk') badges.push('<span class="badge badge-fk">FK</span>');
        if (f.isRelation && f.relationType === 'o2o') badges.push('<span class="badge badge-o2o">O2O</span>');
        if (f.isRelation && f.relationType === 'm2m') badges.push('<span class="badge badge-m2m">M2M</span>');
        if (f.nullable) badges.push('<span class="badge badge-null">NULL</span>');

        const nameClass = f.pk ? 'field-name pk' : 'field-name';
        let relatedHtml = '';
        if (f.isRelation && f.relatedModel && nodeMap[f.relatedModel]) {
            const relName = nodeMap[f.relatedModel].label;
            relatedHtml = `<a class="relation-link" onclick="selectModel('${f.relatedModel}')">${relName}</a>`;
        }

        html += `
            <tr>
                <td class="${nameClass}">${f.name}</td>
                <td class="field-type">${f.type}${f.maxLength ? `(${f.maxLength})` : ''}</td>
                <td class="field-badges">${badges.join('')}</td>
                <td>${relatedHtml}</td>
            </tr>
        `;
    });

    html += '</tbody></table>';

    if (incoming.length > 0) {
        html += `<div class="relations-section"><h3>Referenced By</h3><div class="relation-cards">`;
        incoming.forEach(edge => {
            const sourceNode = nodeMap[edge.source];
            if (!sourceNode) return;
            const typeLabel = { fk: 'FK', o2o: 'O2O', m2m: 'M2M' }[edge.type] || edge.type;
            html += `
                <div class="relation-card" onclick="selectModel('${edge.source}')">
                    <span class="rel-direction">&larr;</span>
                    <span class="rel-model">${sourceNode.label}</span>
                    <span class="rel-field">.${edge.field} (${typeLabel})</span>
                </div>
            `;
        });
        html += '</div></div>';
    }

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
                </div>
            `;
        });
        html += '</div></div>';
    }

    detail.innerHTML = html;
}

// --- Cytoscape ---

function initCytoscape() {
    if (cy) return;

    const elements = [];

    graphData.nodes.forEach(node => {
        elements.push({
            data: {
                id: node.id,
                label: `${node.label}\n${node.app}`,
                modelName: node.label,
                app: node.app,
                fieldCount: node.fields.length,
            }
        });
    });

    graphData.edges.forEach((edge, i) => {
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

    cy = cytoscape({
        container: document.getElementById('cy'),
        elements: elements,
        style: [
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
        ],
        layout: {
            name: 'fcose',
            quality: 'default',
            animate: false,
            nodeDimensionsIncludeLabels: true,
            idealEdgeLength: 200,
            nodeRepulsion: 8000,
            edgeElasticity: 0.45,
            gravityRange: 1.5,
            padding: 40,
        },
        minZoom: 0.1,
        maxZoom: 4,
        wheelSensitivity: 0.3,
    });

    cy.on('tap', 'node', function(evt) {
        selectModel(evt.target.id());
    });

    setTimeout(() => centerOnNode(graphData.centralNode), 100);
}

function centerOnNode(nodeId) {
    if (!cy) return;
    const node = cy.getElementById(nodeId);
    if (node.length) {
        cy.animate({
            center: { eles: node },
            zoom: 1.5,
        }, { duration: 300 });
    }
}

// --- Init ---
buildModelList();
initCytoscape();
selectModel(graphData.centralNode);
