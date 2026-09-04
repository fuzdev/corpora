import { TaskError, type Task } from '@fuzdev/gro';
import { spawn, spawn_out } from '@fuzdev/fuz_util/process.ts';

import { PROJECT_STATS_DATA_PATH } from './project_stats_update.task.ts';

export const task: Task = {
	summary: 'publish the package, refreshing project stats first',
	run: async ({ args, invoke_task, log }) => {
		await invoke_task('project_stats_update');
		const { stdout } = await spawn_out('git', ['status', '--porcelain', PROJECT_STATS_DATA_PATH]);
		if (stdout?.trim()) {
			const added = await spawn('git', ['add', PROJECT_STATS_DATA_PATH]);
			if (!added.ok) throw new TaskError(`Failed to stage ${PROJECT_STATS_DATA_PATH}`);
			const committed = await spawn('git', ['commit', '-m', 'chore: update project stats']);
			if (!committed.ok) throw new TaskError('Failed to commit the project stats update');
			log.info('committed refreshed project stats');
		} else {
			log.info('project stats are already current');
		}
		await invoke_task('gro/publish', args);
	}
};
