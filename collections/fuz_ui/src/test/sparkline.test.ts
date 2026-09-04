import { assert, describe, test } from 'vitest';

import { sparkline_geometry } from '$lib/sparkline.ts';

const OPTIONS = { width: 100, height: 24, stroke_width: 2 };

describe('sparkline_geometry', () => {
	test('returns null for fewer than 2 values', () => {
		assert.isNull(sparkline_geometry([], OPTIONS));
		assert.isNull(sparkline_geometry([5], OPTIONS));
	});

	test('maps values to inset coordinates and alphas', () => {
		const geometry = sparkline_geometry([0, 10], { ...OPTIONS, max: 10 });
		assert.ok(geometry);
		// pad is stroke_width / 2 = 1: 0 → bottom inset, 10 → top inset
		assert.strictEqual(geometry.points, '1,23 99,1');
		assert.deepEqual(geometry.stops, [
			{ offset: 0.01, opacity: 0.4 },
			{ offset: 0.99, opacity: 1 }
		]);
		assert.strictEqual(geometry.end_x, 99);
		assert.strictEqual(geometry.end_y, 1);
		assert.strictEqual(geometry.end_alpha, 1);
	});

	test('defaults max to the local max', () => {
		const with_default = sparkline_geometry([0, 5], OPTIONS);
		const with_explicit = sparkline_geometry([0, 5], { ...OPTIONS, max: 5 });
		assert.deepEqual(with_default, with_explicit);
	});

	test('clamps values above max', () => {
		const geometry = sparkline_geometry([0, 20], { ...OPTIONS, max: 10 });
		assert.ok(geometry);
		assert.strictEqual(geometry.end_y, 1);
		assert.strictEqual(geometry.end_alpha, 1);
	});

	test('renders all-zero values as a flat floor-alpha baseline', () => {
		const geometry = sparkline_geometry([0, 0, 0], OPTIONS);
		assert.ok(geometry);
		assert.strictEqual(geometry.points, '1,23 50,23 99,23');
		assert.deepEqual(geometry.stops, [
			{ offset: 0.01, opacity: 0.4 },
			{ offset: 0.99, opacity: 0.4 }
		]);
	});

	test('sqrt and power scales compress geometry but not alpha', () => {
		// ratio 0.25: sqrt → 0.5, cube root → ~0.63, log1p(4)/log1p(16) → ~0.57
		const linear = sparkline_geometry([0, 4, 16], { ...OPTIONS, max: 16 });
		const sqrt = sparkline_geometry([0, 4, 16], { ...OPTIONS, max: 16, scale: 'sqrt' });
		const cbrt = sparkline_geometry([0, 4, 16], { ...OPTIONS, max: 16, scale: 1 / 3 });
		const log = sparkline_geometry([0, 4, 16], { ...OPTIONS, max: 16, scale: 'log' });
		assert.ok(linear && sqrt && cbrt && log);
		const mid_y = (points: string): number => Number(points.split(' ')[1]!.split(',')[1]);
		// higher scaled ratio → smaller y (closer to the top)
		assert.strictEqual(mid_y(linear.points), 24 - 1 - 0.25 * 22); // 17.5
		assert.strictEqual(mid_y(sqrt.points), 24 - 1 - 0.5 * 22); // 12
		assert.isBelow(mid_y(cbrt.points), mid_y(sqrt.points));
		assert.isBelow(mid_y(log.points), mid_y(sqrt.points));
		assert.isAbove(mid_y(log.points), mid_y(cbrt.points));
		// alpha is identical across scales
		for (const geometry of [sqrt, cbrt, log]) {
			assert.deepEqual(geometry.stops, linear.stops);
		}
	});

	test('thins gradient stops to run boundaries', () => {
		const geometry = sparkline_geometry([0, 0, 0, 0, 10], { ...OPTIONS, max: 10 });
		assert.ok(geometry);
		// first, the zero-run's right boundary, and the final stop survive
		assert.deepEqual(
			geometry.stops.map((s) => s.opacity),
			[0.4, 0.4, 1]
		);
	});

	test('end_dot widens the inset and reports the dot radius', () => {
		const geometry = sparkline_geometry([0, 10], { ...OPTIONS, max: 10, end_dot: true });
		assert.ok(geometry);
		// pad becomes the dot radius (= stroke_width = 2)
		assert.strictEqual(geometry.points, '2,22 98,2');
		assert.strictEqual(geometry.dot_radius, 2);
		assert.strictEqual(geometry.end_x, 98);
		assert.strictEqual(geometry.end_y, 2);
	});
});
