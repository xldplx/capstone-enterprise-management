const normalizeId = value => value === null || value === undefined || value === '' ? null : String(value);
const normalizeCode = value => String(value || '').trim().replace(/\s+/g, '').replace(/\.+$/, '');

export function getWbsDescendantIds(nodes, selectedId) {
    const rootId = normalizeId(selectedId);
    if (rootId === null) return new Set();
    const childrenByParent = new Map();
    nodes.forEach(node => {
        const parentId = normalizeId(node.parent_id);
        if (parentId === null) return;
        const children = childrenByParent.get(parentId) || [];
        children.push(normalizeId(node.id));
        childrenByParent.set(parentId, children);
    });

    const result = new Set([rootId]);
    const queue = [rootId];
    while (queue.length) {
        const current = queue.shift();
        (childrenByParent.get(current) || []).forEach(childId => {
            if (!result.has(childId)) {
                result.add(childId);
                queue.push(childId);
            }
        });
    }
    return result;
}

function isLegacyCodeMatch(taskCode, selectedCode) {
    const task = normalizeCode(taskCode);
    const selected = normalizeCode(selectedCode);
    if (!task || !selected) return false;
    return task === selected || task.startsWith(`${selected}.`);
}

export function filterTasksByWbs(tasks, nodes, selectedId) {
    if (selectedId === null || selectedId === undefined || selectedId === '') return tasks;
    const ids = getWbsDescendantIds(nodes, selectedId);
    const selected = nodes.find(node => normalizeId(node.id) === normalizeId(selectedId));
    const fallbackCodes = nodes
        .filter(node => ids.has(normalizeId(node.id)))
        .map(node => node.wbs_code);
    return tasks.filter(task => {
        const taskWbsId = normalizeId(task.wbs_id);
        if (taskWbsId !== null) return ids.has(taskWbsId);
        return fallbackCodes.some(code => isLegacyCodeMatch(task.wbs_code, code))
            || isLegacyCodeMatch(task.wbs_code, selected?.wbs_code);
    });
}

export function buildWbsTaskCounts(tasks, nodes) {
    return Object.fromEntries(nodes.map(node => [node.id, filterTasksByWbs(tasks, nodes, node.id).length]));
}
