/**
 * SprintBoard — the kanban view of one sprint.
 * Location: frontend/src/pages/dashboard/features/agile/SprintBoard.jsx
 *
 * Board state is a real column now, so a move is one PATCH and the card lands
 * where it was dropped. Dropping into Blocked asks for a reason, because a
 * blocked card that cannot say why is the one thing a stand-up cannot use.
 *
 * Dragging uses the browser's own drag events rather than a drag-and-drop
 * library; every card also carries a status dropdown so the board works by
 * keyboard and on touch, where HTML5 dragging is unreliable.
 */
import { useState } from 'react';
import { AlertTriangle, Clock, GripVertical, Loader2, User, Ban } from 'lucide-react';
import { useTranslation } from '../../../../utils/i18n';
import { BOARD_COLUMNS, COLUMN_STYLES } from '../../../../utils/agileConstants';
import { NULL_DISPLAY } from '../../../../utils/uiConstants';

function TaskCard({ card, canMove, isBusy, isDragging, onMove, onOpen, onDragStart, onDragEnd }) {
    const { t } = useTranslation();
    const style = COLUMN_STYLES[card.board_status] || COLUMN_STYLES.todo;

    return (
        <div
            draggable={canMove && !isBusy}
            onDragStart={() => onDragStart(card)}
            onDragEnd={onDragEnd}
            className={`group bg-white border border-slate-200/70 rounded-2xl p-4 shadow-sm transition-all ${
                isDragging ? 'opacity-40' : 'hover:shadow-md hover:border-slate-300'
            } ${canMove && !isBusy ? 'cursor-grab active:cursor-grabbing' : ''}`}
        >
            <div className="flex items-start gap-2">
                {canMove && <GripVertical className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-0.5 group-hover:text-slate-400" />}
                <button
                    onClick={() => onOpen(card)}
                    className="min-w-0 flex-1 text-left"
                    title={t('agile.openStory')}
                >
                    <p className="text-xs font-black text-slate-800 leading-snug break-words hover:text-emerald-700 transition-colors">
                        {card.task_name}
                    </p>
                    <p className="font-mono text-[9px] text-slate-400 mt-1 uppercase tracking-widest">
                        {card.wbs_code || NULL_DISPLAY}
                    </p>
                </button>
                {isBusy && <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500 shrink-0" />}
            </div>

            {card.board_status === 'blocked' && card.blocked_reason && (
                <div className="flex items-start gap-1.5 mt-2.5 p-2 rounded-lg bg-rose-50 border border-rose-100 text-rose-700">
                    <Ban className="w-3 h-3 shrink-0 mt-0.5" />
                    <p className="text-[10px] font-bold leading-snug">{card.blocked_reason}</p>
                </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5 mt-3">
                <span className={`px-2 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-wider ${style.chip}`}>
                    {card.story_points === null
                        ? t('agile.unestimated')
                        : `${card.story_points} ${t('agile.points')}`}
                </span>
                <span className="px-2 py-0.5 rounded-md border border-slate-200 bg-slate-50 text-slate-500 text-[9px] font-black uppercase tracking-wider">
                    {card.pct_complete}%
                </span>
                {/* Hours stay visible next to points — the figure a construction
                    planner actually trusts. */}
                {card.planned_hours > 0 && (
                    <span className="px-2 py-0.5 rounded-md border border-slate-200 bg-slate-50 text-slate-500 text-[9px] font-black uppercase tracking-wider">
                        {card.planned_hours}h
                    </span>
                )}
                {/* Overdue is derived from the CPM schedule, so it decorates the
                    card rather than being a column someone can drag into. */}
                {card.days_overdue > 0 ? (
                    <span className="px-2 py-0.5 rounded-md border border-rose-100 bg-rose-50 text-rose-700 text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        {card.days_overdue}{t('agile.daysOverdueShort')}
                    </span>
                ) : card.float !== null && card.float <= 3 && card.board_status !== 'done' ? (
                    <span className="px-2 py-0.5 rounded-md border border-amber-100 bg-amber-50 text-amber-700 text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {card.float}{t('agile.daysFloatShort')}
                    </span>
                ) : null}
            </div>

            <div className="flex items-center gap-2 mt-3">
                <div className="flex items-center gap-1.5 min-w-0 flex-1 text-slate-400">
                    <User className="w-3 h-3 shrink-0" />
                    <span className="text-[10px] font-bold truncate">
                        {card.assignee_name || t('agile.unassigned')}
                    </span>
                </div>
                {canMove && (
                    <select
                        value={card.board_status}
                        disabled={isBusy}
                        onChange={event => onMove(card, event.target.value)}
                        aria-label={`${card.task_name} — ${t('agile.moveTo')}`}
                        className="px-2 py-1 bg-slate-50/70 border border-slate-200/60 rounded-lg text-[10px] font-bold text-slate-600 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all disabled:opacity-50"
                    >
                        {BOARD_COLUMNS.map(column => (
                            <option key={column} value={column}>{t(COLUMN_STYLES[column].labelKey)}</option>
                        ))}
                    </select>
                )}
            </div>
        </div>
    );
}

export default function SprintBoard({ columns, canMove, busyTaskId, onMove, onOpen }) {
    const { t } = useTranslation();
    const [draggingCard, setDraggingCard] = useState(null);
    const [hoverColumn, setHoverColumn]   = useState(null);

    const handleDrop = (column) => {
        setHoverColumn(null);
        const card = draggingCard;
        setDraggingCard(null);
        if (card && card.board_status !== column) onMove(card, column);
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            {BOARD_COLUMNS.map(column => {
                const style     = COLUMN_STYLES[column];
                const cards     = columns[column] || [];
                const isHovered = hoverColumn === column;
                const points    = cards.reduce((sum, card) => sum + (card.story_points ?? 0), 0);

                return (
                    <div
                        key={column}
                        onDragOver={event => {
                            if (!canMove || !draggingCard) return;
                            event.preventDefault();
                            setHoverColumn(column);
                        }}
                        onDragLeave={() => setHoverColumn(current => (current === column ? null : current))}
                        onDrop={event => {
                            if (!canMove || !draggingCard) return;
                            event.preventDefault();
                            handleDrop(column);
                        }}
                        className={`rounded-[1.5rem] border transition-all duration-200 ${
                            isHovered
                                ? 'border-emerald-300 bg-emerald-50/40 ring-4 ring-emerald-500/10'
                                : 'border-slate-200/60 bg-slate-50/40'
                        }`}
                    >
                        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-200/50">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${style.accent}`} />
                                <h4 className={`text-[10px] font-black uppercase tracking-[0.12em] truncate ${style.header}`}>
                                    {t(style.labelKey)}
                                </h4>
                            </div>
                            <span className="text-[10px] font-black text-slate-400 bg-white border border-slate-200 rounded-md px-2 py-0.5 shrink-0">
                                {cards.length}{points > 0 ? ` · ${points}` : ''}
                            </span>
                        </div>

                        <div className="p-3 space-y-3 min-h-[8rem]">
                            {cards.length > 0 ? cards.map(card => (
                                <TaskCard
                                    key={card.id}
                                    card={card}
                                    canMove={canMove}
                                    isBusy={busyTaskId === card.id}
                                    isDragging={draggingCard?.id === card.id}
                                    onMove={onMove}
                                    onOpen={onOpen}
                                    onDragStart={setDraggingCard}
                                    onDragEnd={() => { setDraggingCard(null); setHoverColumn(null); }}
                                />
                            )) : (
                                <p className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.15em] text-center py-8">
                                    {t('agile.columnEmpty')}
                                </p>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
