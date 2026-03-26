import { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../api';
import { useNavigate } from 'react-router-dom';

export default function NotificationBell() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!user?.id) return;
        const fetch = () => {
            getNotifications(user.id)
                .then(r => {
                    setNotifications(r.data.notifications || []);
                    setUnreadCount(r.data.unread_count || 0);
                })
                .catch(() => {});
        };
        fetch();
        const interval = setInterval(fetch, 30000);
        return () => clearInterval(interval);
    }, [user?.id]);

    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleClick = async (notif) => {
        if (!notif.read) {
            await markNotificationRead(notif.id, user.id);
            setUnreadCount(c => Math.max(0, c - 1));
            setNotifications(prev =>
                prev.map(n => n.id === notif.id ? { ...n, read: true } : n)
            );
        }
        if (notif.link) navigate(notif.link);
        setOpen(false);
    };

    const handleMarkAllRead = async () => {
        await markAllNotificationsRead(user.id);
        setUnreadCount(0);
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    };

    if (!user) return null;

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(!open)}
                className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
                <Bell size={20} className="text-slate-600" />
                {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden z-50">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                        <span className="text-sm font-bold text-slate-800">Notifications</span>
                        {unreadCount > 0 && (
                            <button
                                onClick={handleMarkAllRead}
                                className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                            >
                                Mark all read
                            </button>
                        )}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="px-4 py-8 text-center text-sm text-slate-400">
                                No notifications yet
                            </div>
                        ) : (
                            notifications.map(notif => (
                                <button
                                    key={notif.id}
                                    onClick={() => handleClick(notif)}
                                    className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-50 ${
                                        !notif.read ? 'bg-purple-50/50' : ''
                                    }`}
                                >
                                    <div className="flex items-start gap-3">
                                        {!notif.read && (
                                            <div className="w-2 h-2 rounded-full bg-purple-500 mt-1.5 flex-shrink-0" />
                                        )}
                                        <div className={!notif.read ? '' : 'ml-5'}>
                                            <p className="text-sm font-medium text-slate-800">{notif.title}</p>
                                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{notif.message}</p>
                                            <p className="text-[10px] text-slate-400 mt-1">{new Date(notif.created_at).toLocaleDateString()}</p>
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
