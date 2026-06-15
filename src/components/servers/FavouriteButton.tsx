import { Button } from "../ui/button";

interface FavouriteButtonProps {
  isFavourite: boolean;
  onToggle: () => void;
}

export function FavouriteButton({ isFavourite, onToggle }: FavouriteButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      aria-label={isFavourite ? "Remove from favourites" : "Add to favourites"}
      className={`p-0.5 shrink-0 ${
        isFavourite
          ? "text-yellow-400 hover:text-yellow-300"
          : "text-faint hover:text-yellow-400"
      }`}
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
        fill={isFavourite ? "currentColor" : "none"}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
      </svg>
    </Button>
  );
}
