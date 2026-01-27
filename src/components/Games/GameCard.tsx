import Image from "next/image";
import Link from "next/link";

interface GameCardProps {
  title: string;
  description: string;
  image: string;
  players: number;
  bgColor?: string;
  textColor?: string;
  url: string;
}

export default function GameCard({
  title,
  description,
  image,
  players,
  bgColor = "bg-gray-800",
  textColor = "text-white",
  url,
}: GameCardProps) {
  return (
    <Link href={`/games/${url}`}>
      <div className="rounded-xl overflow-hidden h-full flex flex-col transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-[#FFD700]/20 hover:z-10 cursor-pointer group border-2 border-[#5D4037] bg-[#3E2723]">
        <div className="relative overflow-hidden">
          <Image
            src={image || "/placeholder.svg"}
            alt={title}
            width={500}
            height={300}
            className="w-full h-48 object-cover transition-transform duration-300 group-hover:scale-110"
          />
        </div>
        <div
          className={`${bgColor} p-6 flex-1 flex flex-col transition-colors duration-300 group-hover:brightness-110`}
        >
          <h3 
            className="text-2xl font-bold mb-2 text-[#FFD700]"
            style={{ fontFamily: 'PixelFont, Arial, sans-serif', textShadow: '2px 2px 0 #000' }}
          >
            {title}
          </h3>
          <p 
            className={`${textColor} opacity-90 text-sm flex-1`}
            style={{ fontFamily: 'PixelFont, Arial, sans-serif' }}
          >
            {description}
          </p>
          <div 
            className="mt-4 px-4 py-2 bg-[#7BC043] hover:bg-[#8BC34A] text-white text-center rounded-lg transition-colors border-2 border-[#5D9B3A]"
            style={{ fontFamily: 'PixelFont, Arial, sans-serif' }}
          >
            Play Now
          </div>
        </div>
      </div>
    </Link>
  );
}
