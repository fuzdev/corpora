// TODO move to module context?

export type AlertStatus = 'inform' | 'help' | 'error';

export interface AlertStatusOptions {
	color: string;
	icon: string | null;
}

export const alert_status_options: Record<AlertStatus, AlertStatusOptions> = {
	inform: { color: 'var(--text_70)', icon: '✻' },
	help: { color: 'var(--palette_b_50)', icon: '➺' },
	error: { color: 'var(--palette_c_50)', icon: '!?' }
};
