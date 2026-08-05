import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { createPortal } from 'react-dom';

export default function RowActionsMenu({ label = 'More actions', actions = [] }) {
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState(null);
    const triggerRef = useRef(null);
    const menuRef = useRef(null);

    const close = (restoreFocus = true) => {
        setOpen(false);
        if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
    };

    const toggle = () => {
        if (open) { close(false); return; }
        const rect = triggerRef.current?.getBoundingClientRect();
        if (rect) setPosition({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
        setOpen(true);
    };

    useEffect(() => {
        if (!open) return undefined;
        const onPointerDown = event => {
            if (!menuRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) close(false);
        };
        const onKeyDown = event => {
            if (event.key === 'Escape') { event.preventDefault(); close(); return; }
            const items = [...(menuRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') || [])];
            if (!items.length) return;
            const current = items.indexOf(document.activeElement);
            if (event.key === 'ArrowDown') { event.preventDefault(); items[(current + 1) % items.length].focus(); }
            if (event.key === 'ArrowUp') { event.preventDefault(); items[(current - 1 + items.length) % items.length].focus(); }
            if (event.key === 'Home') { event.preventDefault(); items[0].focus(); }
            if (event.key === 'End') { event.preventDefault(); items[items.length - 1].focus(); }
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        requestAnimationFrame(() => menuRef.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus());
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    if (!actions.length) return null;
    return (
        <div className="relative inline-flex">
            <button
                ref={triggerRef}
                type="button"
                aria-label={label}
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={toggle}
                className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-bold hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-colors"
            >
                <MoreHorizontal className="w-4 h-4" />
                <span className="hidden xl:inline">More</span>
            </button>
            {open && position && createPortal(
                <div ref={menuRef} role="menu" aria-label={label} style={position} className="fixed z-[100] min-w-40 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10">
                    {actions.map(action => {
                        const Icon = action.icon;
                        return (
                            <button
                                key={action.label}
                                type="button"
                                role="menuitem"
                                disabled={action.disabled}
                                onClick={() => { close(); action.onSelect(); }}
                                className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-40 ${action.destructive ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-50'}`}
                            >
                                {Icon && <Icon className="w-4 h-4" />}
                                {action.label}
                            </button>
                        );
                    })}
                </div>,
                document.body,
            )}
        </div>
    );
}
