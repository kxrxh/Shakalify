import {
	type EffectOptions,
	formatPosterizeLabel,
	POSTERIZE_MAX,
} from "../lib/effects";

type ToggleKey = Exclude<keyof EffectOptions, "posterize">;

const EXTRA_EFFECTS: { key: ToggleKey; label: string; hint: string }[] = [
	{ key: "noise", label: "Шум", hint: "Зерно" },
	{ key: "scanlines", label: "Scanlines", hint: "Горизонтальные линии" },
];

function OptionToggle({
	checked,
	onChange,
	label,
	hint,
	disabled,
}: {
	checked: boolean;
	onChange: (checked: boolean) => void;
	label: string;
	hint: string;
	disabled?: boolean;
}) {
	return (
		<label className="option-toggle option-toggle--compact">
			<input
				type="checkbox"
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
				disabled={disabled}
			/>
			<span className="option-toggle__box" aria-hidden="true" />
			<span className="option-toggle__text">{label}</span>
			<span className="option-toggle__hint">{hint}</span>
		</label>
	);
}

export function EffectsPanel({
	effects,
	onChange,
	pixelScale,
	onPixelScaleChange,
	exportPng,
	onExportPngChange,
	disabled,
}: {
	effects: EffectOptions;
	onChange: (effects: EffectOptions) => void;
	pixelScale: number;
	onPixelScaleChange: (scale: number) => void;
	exportPng: boolean;
	onExportPngChange: (png: boolean) => void;
	disabled?: boolean;
}) {
	const toggle = (key: ToggleKey, value: boolean) => {
		onChange({ ...effects, [key]: value });
	};

	return (
		<div className="effects-panel">
			<div className="effects-section">
				<div className="effects-section__header">
					<h3 className="effects-title">Постеризация</h3>
					<span className="effects-meta">
						{formatPosterizeLabel(effects.posterize)}
					</span>
				</div>
				<div className="posterize-control">
					<input
						id="posterize"
						aria-label="Постеризация"
						type="range"
						min={0}
						max={POSTERIZE_MAX}
						step={1}
						value={effects.posterize}
						onChange={(e) =>
							onChange({ ...effects, posterize: Number(e.target.value) })
						}
						className="posterize-slider"
						disabled={disabled}
						style={
							{
								"--fill": `${(effects.posterize / POSTERIZE_MAX) * 100}%`,
							} as React.CSSProperties
						}
					/>
					<div className="posterize-labels" aria-hidden="true">
						<span>выкл</span>
						<span>сильно</span>
					</div>
					{effects.posterize > 0 && (
						<button
							type="button"
							className="posterize-reset"
							onClick={() => onChange({ ...effects, posterize: 0 })}
							disabled={disabled}
						>
							Сбросить
						</button>
					)}
				</div>
			</div>

			<div className="effects-section">
				<h3 className="effects-title">Прочее</h3>
				<div className="effects-grid effects-grid--compact">
					{EXTRA_EFFECTS.map(({ key, label, hint }) => (
						<OptionToggle
							key={key}
							checked={effects[key]}
							onChange={(v) => toggle(key, v)}
							label={label}
							hint={hint}
							disabled={disabled}
						/>
					))}
				</div>
			</div>

			<div className="effects-row">
				<span className="effects-row__label">Масштаб экспорта</span>
				<fieldset className="segmented">
					<legend className="segmented__legend">Масштаб экспорта</legend>
					{[1, 2, 3].map((scale) => (
						<button
							key={scale}
							type="button"
							className={`segmented__btn ${pixelScale === scale ? "segmented__btn--active" : ""}`}
							onClick={() => onPixelScaleChange(scale)}
							aria-pressed={pixelScale === scale}
							disabled={disabled}
						>
							{scale}×
						</button>
					))}
				</fieldset>
			</div>

			<OptionToggle
				checked={exportPng}
				onChange={onExportPngChange}
				label="Экспорт PNG"
				hint="Без JPEG при скачивании"
				disabled={disabled}
			/>
		</div>
	);
}

export type { EffectOptions };
