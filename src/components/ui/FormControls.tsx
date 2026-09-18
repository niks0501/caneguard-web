import { ChevronDown, Search } from "lucide-react";
import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

interface SearchInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function SearchInput({
  label = "Search reports",
  className = "",
  ...props
}: SearchInputProps) {
  return (
    <label className={`search-input ${className}`.trim()}>
      <span className="sr-only">{label}</span>
      <Search aria-hidden="true" size={18} />
      <input type="search" {...props} />
    </label>
  );
}

interface SelectFilterProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  className?: string;
}

export function SelectFilter({
  label,
  className = "",
  children,
  ...props
}: SelectFilterProps) {
  return (
    <label className={`select-filter ${className}`.trim()}>
      <span className="select-filter__label">{label}</span>
      <div className="select-filter__control">
        <select {...props}>{children}</select>
        <ChevronDown
          className="select-filter__chevron"
          aria-hidden="true"
          size={16}
        />
      </div>
    </label>
  );
}

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
}

export function TextArea({ label, hint, id, ...props }: TextAreaProps) {
  return (
    <label className="text-area" htmlFor={id}>
      <span>{label}</span>
      {hint ? <small>{hint}</small> : null}
      <textarea id={id} {...props} />
    </label>
  );
}
