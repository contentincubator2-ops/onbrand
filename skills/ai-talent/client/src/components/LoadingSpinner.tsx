interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  message?: string;
}

export default function LoadingSpinner({ size = "md", message }: LoadingSpinnerProps) {
  const sizeClass = {
    sm: "h-4 w-4 border-2",
    md: "h-8 w-8 border-2",
    lg: "h-12 w-12 border-4",
  }[size];

  return (
    <div className="flex flex-col items-center justify-center gap-2 py-4">
      <div
        className={`animate-spin rounded-full border-gray-200 border-t-indigo-600 ${sizeClass}`}
      />
      {message && <p className="text-sm text-gray-500">{message}</p>}
    </div>
  );
}
