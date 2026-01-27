"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Medal, Trophy } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TetrisScore } from "@/types/interface";
import { formatAddress } from "@/types/helper";

type SortOption = "score" | "email";

export default function Leaderboard() {
  const [tetrisScores, setTetrisScores] = useState<TetrisScore[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>("score");

  // Sort the data based on the selected option
  const sortedData = [...tetrisScores].sort((a, b) => {
    if (sortBy === "score") {
      return b.score - a.score;
    } else {
      return a.email.localeCompare(b.email);
    }
  });

  useEffect(() => {
    const fetchTetrisLeaderboard = async () => {
      const url = `${process.env.NEXT_PUBLIC_TRACKIT_API_HOST}/game/score`;
      try {
        const response = await fetch(url);
        if (response.ok) {
          const result = await response.json();
          setTetrisScores(result);
        } else {
          console.log("Failed to fetch tetris leaderboard!");
        }
      } catch (error) {
        console.log("Failed to fetch tetris leaderboard!");
      }
    };

    fetchTetrisLeaderboard();
  }, []);

  return (
    <Card className="w-full max-w-4xl mx-auto bg-transparent border border-bluesky text-gray-50 p-0">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-2xl font-bold">Tetris</CardTitle>
            <CardDescription>Top players ranked by score</CardDescription>
          </div>
          {/* <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Sort by: {sortBy === "score" ? "Score" : "Name"}
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSortBy("score")}>
                Score
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("name")}>
                Name
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu> */}
        </div>
      </CardHeader>
      <CardContent className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-16">Rank</TableHead>
              <TableHead>Player</TableHead>
              <TableHead className="text-right">Score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((player, index) => (
              <TableRow key={player.id} className="hover:bg-transparent">
                <TableCell className="font-medium">
                  {index === 0 ? (
                    <Badge className="bg-yellow-500 hover:bg-yellow-600">
                      <Trophy className="h-4 w-4 mr-1" />
                      {index + 1}
                    </Badge>
                  ) : index === 1 ? (
                    <Badge className="bg-gray-400 hover:bg-gray-500">
                      <Medal className="h-4 w-4 mr-1" />
                      {index + 1}
                    </Badge>
                  ) : index === 2 ? (
                    <Badge className="bg-amber-700 hover:bg-amber-800">
                      <Medal className="h-4 w-4 mr-1" />
                      {index + 1}
                    </Badge>
                  ) : (
                    <span className="ml-3">{index + 1}</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src="/logo.png" alt="avatar" />
                      <AvatarFallback>Avatar</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="hidden md:block font-medium">
                        {player.move_wallet}
                      </div>
                      <div className="md:hidden font-medium">
                        {formatAddress(player.move_wallet)}
                      </div>
                      {/* <div className="text-sm text-muted-foreground">
                        // {player.email}
                      </div> */}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono font-medium">
                  {player.score.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
