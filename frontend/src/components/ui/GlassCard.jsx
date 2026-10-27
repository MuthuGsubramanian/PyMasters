import { motion } from 'framer-motion';
import { Card } from './Card';
import { cn } from '../../lib/cn';

/** Staggered fade-up used by section cards (index = stagger slot). */
const sectionVariant = {
    hidden: { opacity: 0, y: 24 },
    visible: (i) => ({
        opacity: 1,
        y: 0,
        transition: { delay: i * 0.08, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
    }),
};

const MotionCard = motion(Card);

/** Surface card that fades up on mount. Shared by Profile and Play. */
export function GlassCard({ children, className = '', index = 0, ...rest }) {
    return (
        <MotionCard
            custom={index}
            variants={sectionVariant}
            initial="hidden"
            animate="visible"
            className={cn('shadow-sm p-6', className)}
            {...rest}
        >
            {children}
        </MotionCard>
    );
}

/** Icon chip + title (+ optional subtitle) heading for a section card. */
export function SectionHeading({ icon: Icon, title, subtitle }) {
    return (
        <div className="flex items-center gap-3 mb-5">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-primary text-white">
                {Icon && <Icon size={18} />}
            </div>
            <div>
                <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
                {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
            </div>
        </div>
    );
}
