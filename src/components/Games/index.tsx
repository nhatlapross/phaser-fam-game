import { GamepadIcon, ScrollTextIcon } from "lucide-react";
import GameCard from "./GameCard";

export default function PopularGames() {
  const games = [
    {
      id: 1,
      title: "Tetris",
      description:
        "Score as many points as possible by clearing horizontal rows of blocks.",
      image: "/tetris_img.jpg",
      players: 2,
      bgColor: "bg-[#3D1A1A]",
      textColor: "text-white",
      url: "tetris",
    },
    // Add more games here as they become available
  ];

  return (
    <div className="text-gray-300 space-y-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <GamepadIcon className="text-[#FFD700]" />
          <h2 
            className="text-2xl font-bold tracking-wide text-[#FFD700]"
            style={{ fontFamily: 'PixelFont, Arial, sans-serif' }}
          >
            Available Games
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-fr relative">
          {games.map((game) => (
            <GameCard
              key={game.id}
              title={game.title}
              description={game.description}
              image={game.image}
              players={game.players}
              bgColor={game.bgColor}
              textColor={game.textColor}
              url={game.url}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
