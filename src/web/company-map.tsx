import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { Background, Controls, Handle, Position, ReactFlow, useNodesState, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Building2, GripVertical } from 'lucide-react';
import type { Project, ProjectHandover, SisterWorkspace, Workspace } from '../shared/types';
import { useI18n } from './i18n';
import { readableTextOn } from './helpers';

/**
 * Firmenkarte: die eigene Firma mit ihren Projekten und die Schwesterfirmen als Knoten.
 * Ein Projekt auf eine Schwesterfirma ziehen öffnet die Übergabe; ein Klick auf das Projekt auch.
 * Die Kanten zeigen, was zwischen zwei Firmen gerade offen ist und was schon übergeben wurde.
 */
const DRAG_TYPE = 'application/x-vave-project';
const MAX_CHIPS = 10;
interface OwnData extends Record<string, unknown> { kind: 'own'; name: string; currency: string; projects: Project[]; more: number; canOffer: boolean; onPick: (project: Project) => void; label: { projects: string; more: string; drag: string; none: string } }
interface SisterData extends Record<string, unknown> { kind: 'sister'; id: string; name: string; currency: string; canOffer: boolean; onDropProject: (projectId: string, sisterId: string) => void; hint: string; dropLabel: string }
type FirmNode = Node<OwnData | SisterData, 'firm'>;

function FirmCard({ data }: NodeProps<FirmNode>) {
  const [over, setOver] = useState(false);
  if (data.kind === 'own') {
    return <div className="firm-node firm-own">
      <div className="firm-head"><Building2 size={16} aria-hidden="true"/><strong>{data.name}</strong><small>{data.currency}</small></div>
      <p className="firm-sub">{data.label.projects}</p>
      {data.projects.length ? <ul className="firm-projects nodrag nopan">{data.projects.map((p) => <li key={p.id}>
        <button className="firm-chip" draggable={data.canOffer} disabled={!data.canOffer} title={data.canOffer ? data.label.drag : undefined}
          onDragStart={(e: DragEvent<HTMLButtonElement>) => { e.dataTransfer.setData(DRAG_TYPE, p.id); e.dataTransfer.setData('text/plain', `${p.code} ${p.name}`); e.dataTransfer.effectAllowed = 'move'; }}
          onClick={() => data.onPick(p)}>
          {data.canOffer && <GripVertical size={12} aria-hidden="true"/>}<span className="firm-code" style={{ background: p.color, color: readableTextOn(p.color) }}>{p.code}</span><span className="firm-name">{p.name}</span>
        </button></li>)}</ul> : <p className="firm-empty">{data.label.none}</p>}
      {data.more > 0 && <p className="firm-more">{data.label.more}</p>}
      <Handle type="source" position={Position.Right} isConnectable={false}/>
    </div>;
  }
  const accepts = (e: DragEvent<HTMLDivElement>) => data.canOffer && e.dataTransfer.types.includes(DRAG_TYPE);
  return <div className={`firm-node firm-sister${over ? ' firm-over' : ''}`}
    onDragOver={(e) => { if (accepts(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(true); } }}
    onDragLeave={() => setOver(false)}
    onDrop={(e) => { setOver(false); const id = e.dataTransfer.getData(DRAG_TYPE); if (id && data.canOffer) { e.preventDefault(); data.onDropProject(id, data.id); } }}>
    <Handle type="target" position={Position.Left} isConnectable={false}/>
    <div className="firm-head"><Building2 size={16} aria-hidden="true"/><strong>{data.name}</strong><small>{data.currency}</small></div>
    <p className="firm-sub">{over ? data.dropLabel : data.hint}</p>
  </div>;
}
const nodeTypes = { firm: FirmCard };

export default function CompanyMap({ workspace, sisters, projects, handovers, canOffer, onOffer }: { workspace: Workspace; sisters: SisterWorkspace[]; projects: Project[]; handovers: ProjectHandover[]; canOffer: boolean; onOffer: (project: Project, sisterId?: string) => void }) {
  const { t } = useI18n();
  const computed = useMemo(() => {
    const active = projects.filter((p) => p.status !== 'archived');
    const shown = active.slice(0, MAX_CHIPS);
    const gap = 150, top = -((sisters.length - 1) * gap) / 2 + Math.min(shown.length, MAX_CHIPS) * 14;
    const own: FirmNode = { id: workspace.id, type: 'firm', position: { x: 0, y: 0 }, data: { kind: 'own', name: workspace.name, currency: workspace.currency, projects: shown, more: active.length - shown.length, canOffer, onPick: (p) => onOffer(p),
      label: { projects: t('{count} aktive Projekte', { count: active.length }), more: t('+ {count} weitere in der Liste unten', { count: active.length - shown.length }), drag: t('Auf eine Schwesterfirma ziehen oder anklicken'), none: t('Noch kein aktives Projekt.') } } };
    const others: FirmNode[] = sisters.map((s, i) => ({ id: s.workspace_id, type: 'firm', position: { x: 470, y: top + i * gap }, data: { kind: 'sister', id: s.workspace_id, name: s.name, currency: s.currency, canOffer,
      onDropProject: (projectId, sisterId) => { const p = projects.find((x) => x.id === projectId); if (p) onOffer(p, sisterId); },
      hint: canOffer ? t('Projekt hierher ziehen') : t('Schwesterfirma'), dropLabel: t('Loslassen, um zu übergeben') } }));
    const links: Edge[] = sisters.map((s) => {
      const between = handovers.filter((h) => (h.source_workspace_id === workspace.id && h.target_workspace_id === s.workspace_id) || (h.source_workspace_id === s.workspace_id && h.target_workspace_id === workspace.id));
      const out = between.filter((h) => h.status === 'offered' && h.source_workspace_id === workspace.id).length, incoming = between.filter((h) => h.status === 'offered' && h.target_workspace_id === workspace.id).length, done = between.filter((h) => h.status === 'accepted').length;
      const parts = [out ? t('{count} angeboten', { count: out }) : '', incoming ? t('{count} für euch', { count: incoming }) : '', done ? t('{count} übergeben', { count: done }) : ''].filter(Boolean);
      return { id: `${workspace.id}-${s.workspace_id}`, source: workspace.id, target: s.workspace_id, type: 'smoothstep', animated: out + incoming > 0, label: parts.join(' · ') || undefined, className: out + incoming > 0 ? 'firm-edge-open' : 'firm-edge' };
    });
    return { nodes: [own, ...others], edges: links };
  }, [workspace, sisters, projects, handovers, canOffer, onOffer, t]);
  // Die Firmen lassen sich auf der Karte verschieben; ändern sich die Daten, ordnet sie sich neu.
  const [nodes, setNodes, onNodesChange] = useNodesState<FirmNode>(computed.nodes);
  useEffect(() => { setNodes(computed.nodes); }, [computed.nodes, setNodes]);
  return <div className="company-map" role="group" aria-label={t('Firmenkarte')}>
    <ReactFlow nodes={nodes} edges={computed.edges} onNodesChange={onNodesChange} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.16, maxZoom: 1 }} minZoom={0.4} maxZoom={1.4}
      nodesConnectable={false} elementsSelectable={false} zoomOnScroll={false} zoomOnDoubleClick={false} panOnScroll={false} preventScrolling={false} deleteKeyCode={null}>
      <Background gap={22} size={1}/>
      <Controls showInteractive={false} position="bottom-right"/>
    </ReactFlow>
  </div>;
}
