import { MAX_JPEG_PASSES, type DegradationSettings } from "../lib/processing";
const CONTROLS: {
	key: keyof DegradationSettings;
	label: string;
	min: number;
	max: number;
	suffix: string;
}[] = [
	{ key: "pixelation", label: "Пикселизация", min: 0, max: 100, suffix: "%" },
	{
		key: "jpegQuality",
		label: "JPEG-качество",
		min: 1,
		max: 100,
		suffix: " / 100",
	},
	{
		key: "jpegPasses",
		label: "Повторных сжатий JPEG",
		min: 0,
		max: MAX_JPEG_PASSES,
		suffix: "",
	},
];
export function DegradationControls({
	settings,
	manual,
	onChange,
	onAutomatic,
}: {
	settings: DegradationSettings;
	manual: boolean;
	onChange: (settings: DegradationSettings) => void;
	onAutomatic: () => void;
}) {
	return (
		<details className="degradation-controls">
			<summary>Параметры сжатия{manual ? " · вручную" : ""}</summary>
			<div className="degradation-controls__fields">
				{CONTROLS.map(({ key, label, min, max, suffix }) => (
					<label key={key} className="degradation-control">
						<span className="meter-header">
							<span>{label}</span>
							<span className="effects-meta">
								{settings[key]}
								{suffix}
							</span>
						</span>
						<input
							type="range"
							className="posterize-slider"
							min={min}
							max={max}
							step={1}
							value={settings[key]}
							aria-label={label}
							aria-valuetext={`${settings[key]}${suffix}`}
							onChange={(e) =>
								onChange({ ...settings, [key]: Number(e.target.value) })
							}
						/>
					</label>
				))}
				<p className="control-hint">
					Пикселизация меняет сетку, JPEG — артефакты сжатия. Масштаб экспорта
					задаётся отдельно.
					При 0% выключены пикселизация и повторное сжатие; дополнительные
					эффекты и формат экспорта сохраняются.
				</p>
				{manual && (
					<button
						type="button"
						className="btn btn--ghost"
						onClick={onAutomatic}
					>
						Связать со шкалой
					</button>
				)}
			</div>
		</details>
	);
}
