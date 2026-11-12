import { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../api';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';

export default function NotificationBell({ align = 'right' }) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!user?.id) return;
        const fetchAll = () => {
            getNotifications(user.id)
                .then((r) => {
                    setNotifications(r.data.notifications || []);
                    setUnreadCount(r.data.unread_count || 0);
                })
                .catch(() => {});
        };
        fetchAll();
        const interval = setInterval(fetchAll, 30000);
        return () => clearInterval(interval);
    }, [user?.id]);

    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    const handleClick = async (notif) => {
        if (!notif.read) {
            try {
                await markNotificationRead(notif.id, user.id);
                setUnreadCount((c) => Math.max(0, c - 1));
                setNotifications((prev) =>
                    prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
                );
            } catch {
                // silent
            }
        }
        if (notif.link) navigate(notif.link);
        setOpen(false);
    };

    const handleMarkAllRead = async () => {
        try {
            await markAllNotificationsRead(user.id);
            setUnreadCount(0);
            setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        } catch {
            // silent
        }
    };

    if (!user) return null;

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
                aria-expanded={open}
                className="relative min-w-10 min-h-10 p-2 rounded-lg hover:bg-bg-elevated transition-colors text-text-secondary flex items-center justify-center"
            >
                <Bell size={18} aria-hidden="true" />
                {unreadCount > 0 && (
                    <span className="absolute top-0.5 right-0.5 min-w-4 h-4 px-1 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center leading-none">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <div
                    className={clsx(
                        'absolute mt-2 w-80 max-w-[calc(100vw-1.5rem)] bg-bg-surface backdrop-blur-xl rounded-xl shadow-elegant border border-border-default overflow-hidden z-50',
                        align === 'left' ? 'left-0' : 'right-0'
                    )}
                >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
                        <span className="text-sm font-bold text-text-primary">Notifications</span>
                        {unreadCount > 0 && (
                            <button
                                type="button"
                                onClick={handleMarkAllRead}
                                className="text-xs text-accent-primary hover:underline font-semibold"
                            >
                                Mark all read
                            </button>
                        )}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="px-4 py-8 text-center text-sm text-text-muted">
                                No notifications yet
                            </div>
                        ) : (
                            notifications.map((notif) => (
                                <button
                                    key={notif.id}
                                    type="button"
                                    onClick={() => handleClick(notif)}
                                    className={clsx(
                                        'w-full text-left px-4 py-3 hover:bg-bg-elevated transition-colors border-b border-border-default/60',
                                        !notif.read && 'bg-accent-subtle'
                                    )}
                                >
                                    <div className="flex items-start gap-3">
                                        {!notif.read && (
                                            <div className="w-2 h-2 rounded-full bg-accent-primary mt-1.5 shrink-0" />
                                        )}
                                        <div className={!notif.read ? '' : 'ml-5'}>
                                            <p className="text-sm font-medium text-text-primary">{notif.title}</p>
                                            <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{notif.message}</p>
                                            <p className="text-xs text-text-disabled mt-1">
                                                {(() => {
                                                    const d = new Date(notif.created_at);
                                                    const now = new Date();
                                                    const diff = Math.floor((now - d) / 1000);
                                                    if (diff < 60) return 'Just now';
                                                    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
                                                    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
                                                    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
                                                    return d.toLocaleDateString();
                                                })()}
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
