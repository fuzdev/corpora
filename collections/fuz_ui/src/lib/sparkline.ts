/**
 * Pure geometry helpers behind `Sparkline` and `ProjectActivityChart`.
 *
 * Computes polyline points, alpha-fade gradient stops, and the end-dot
 * position for a series of values, so components stay thin and the math is
 * testable and reusable outside Svelte.
 *
 * @module
 */

/**
 * Vertical scale for a sparkline's geometry. The nonlinear options compress
 * the top of the range so small values stay legible under a large shared
 * max — increasingly so from `'sqrt'` to smaller power exponents (a number
 * in `(0, 1]`, where `1` is linear and `1 / 3` is cube root) to `'log'`.
 */
export type SparklineScale = 'linear' | 'sqrt' | 'log' | number;

export interface SparklineOptions {
	/**
	 * Width of the drawing area in px.
	 */
	width: number;
	/**
	 * Height of the drawing area in px.
	 */
	height: number;
	/**
	 * The value rendered at full height and full alpha.
	 * Pass a shared max across sparklines for comparable scales.
	 * Defaults to the local max of the values.
	 */
	max?: number;
	/**
	 * Vertical scale for the line's geometry. The alpha fade always tracks
	 * the linear ratio regardless of `scale`.
	 *
	 * @default 'linear'
	 */
	scale?: SparklineScale;
	/**
	 * @default 2
	 */
	stroke_width?: number;
	/**
	 * Alpha at a value of 0, scaling linearly to 1 at the max.
	 *
	 * @default 0.4
	 */
	alpha_floor?: number;
	/**
	 * Reserve padding for an end dot of radius `stroke_width` at the final point.
	 *
	 * @default false
	 */
	end_dot?: boolean;
}

/**
 * A gradient stop for the per-point alpha fade.
 */
export interface SparklineStop {
	/**
	 * Gradient offset in `[0, 1]`.
	 */
	offset: number;
	/**
	 * Stop opacity in `[alpha_floor, 1]`.
	 */
	opacity: number;
}

export interface SparklineGeometry {
	/**
	 * SVG polyline `points` string.
	 */
	points: string;
	/**
	 * Alpha-fade gradient stops, thinned to runs' boundaries so long flat
	 * stretches (like all-zero history) cost a constant number of stops.
	 */
	stops: Array<SparklineStop>;
	/**
	 * X coordinate of the final point.
	 */
	end_x: number;
	/**
	 * Y coordinate of the final point.
	 */
	end_y: number;
	/**
	 * Alpha of the final point.
	 */
	end_alpha: number;
	/**
	 * Radius for an end dot, equal to the stroke width.
	 */
	dot_radius: number;
}

const round = (n: number): number => Math.round(n * 100) / 100;

/**
 * Computes the rendering geometry for a sparkline of `values`.
 *
 * Returns `null` when `values` has fewer than 2 points, which cannot form a line.
 */
export const sparkline_geometry = (
	values: Array<number>,
	options: SparklineOptions
): SparklineGeometry | null => {
	if (values.length < 2) return null;
	const {
		width,
		height,
		max,
		scale = 'linear',
		stroke_width = 2,
		alpha_floor = 0.4,
		end_dot = false
	} = options;
	const local_max = max ?? Math.max(0, ...values);
	const scale_max = local_max > 0 ? local_max : 1;
	const dot_radius = stroke_width;
	// inset by half the stroke (or the dot radius) so the extremes aren't clipped
	const pad = end_dot ? Math.max(stroke_width / 2, dot_radius) : stroke_width / 2;
	const x_coord = (index: number): number =>
		pad + (index * (width - 2 * pad)) / (values.length - 1);
	const y_coord = (value: number): number => {
		const clamped = Math.min(value, scale_max);
		const ratio = clamped / scale_max;
		const scaled =
			scale === 'linear'
				? ratio
				: scale === 'sqrt'
					? Math.sqrt(ratio)
					: scale === 'log'
						? Math.log1p(clamped) / Math.log1p(scale_max)
						: ratio ** scale;
		return height - pad - scaled * (height - 2 * pad);
	};
	const alpha = (value: number): number =>
		alpha_floor + (1 - alpha_floor) * (Math.min(value, scale_max) / scale_max);

	const points = values
		.map((value, index) => `${round(x_coord(index))},${round(y_coord(value))}`)
		.join(' ');

	const opacities = values.map((value) => round(alpha(value)));
	const stops: Array<SparklineStop> = [];
	for (let i = 0; i < values.length; i++) {
		const opacity = opacities[i]!;
		// keep the first and last stops and each run's boundaries; drop run interiors
		if (
			i > 0 &&
			i < values.length - 1 &&
			opacity === opacities[i - 1] &&
			opacity === opacities[i + 1]
		) {
			continue;
		}
		stops.push({ offset: round(x_coord(i) / width), opacity });
	}

	return {
		points,
		stops,
		end_x: round(x_coord(values.length - 1)),
		end_y: round(y_coord(values[values.length - 1]!)),
		end_alpha: opacities[values.length - 1]!,
		dot_radius
	};
};
