interface BrandMarkProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASS: Record<Required<BrandMarkProps>['size'], string> = {
  sm: 'brand-mark--sm',
  md: 'brand-mark--md',
  lg: 'brand-mark--lg',
};

function BrandMark({ size = 'md', className }: BrandMarkProps) {
  const classes = ['brand-mark', SIZE_CLASS[size], className].filter(Boolean).join(' ');

  return (
    <span className={classes} aria-label="Mila">
      <span className="brand-mark__hebrew" dir="rtl" lang="he">
        מילה
      </span>
      <span className="brand-mark__divider">·</span>
      <span className="brand-mark__latin">Mila</span>
    </span>
  );
}

export default BrandMark;
