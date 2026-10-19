export function Skeleton({
  width = "100%",
  height = 14,
  label = "جارٍ التحميل",
}: {
  width?: number | string;
  height?: number | string;
  label?: string;
}) {
  return (
    <span className="ui-skeleton" style={{ width, height }} role="status" aria-label={label} />
  );
}
