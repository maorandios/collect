"use client";

import { ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function FilterSelect({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  className?: string;
}) {
  const selected =
    options.find((option) => option.value === value)?.label ?? options[0]?.label ?? "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        className={cn(
          "inline-flex h-11 min-w-40 cursor-pointer items-center justify-between gap-3 rounded-[12px] border border-border bg-card px-3.5 text-sm text-foreground outline-none select-none hover:bg-hover focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:border-ring",
          className,
        )}
      >
        <span className="min-w-0 truncate">{selected}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={6}
        className="w-auto min-w-[var(--anchor-width)] rounded-[12px] border border-border bg-card p-1 shadow-none ring-1 ring-border duration-200 data-open:slide-in-from-top-2"
      >
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value || "all"}
            className={cn(
              "h-9 cursor-pointer rounded-[10px] px-3",
              option.value === value && "bg-primary/10 font-medium text-primary",
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
