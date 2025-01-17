/* eslint-disable no-useless-concat */
// eslint-disable-next-line no-unused-vars
import { MongoClient, Collection } from 'mongodb';

// eslint-disable-next-line import/default
import moment from 'moment-timezone';
import { Kind, GraphQLScalarType } from 'graphql';
import { ObjectID } from 'bson';

let col: Collection<GameData> | null = null;
export const initializeCollection = async () => {
	// eslint-disable-next-line no-process-env, global-require
	const MONGODB_URI = process.env.MONGODB_URI || (require('../env').default || {}).MONGODB_URI;
	console.log("MONGODB_URI", MONGODB_URI)
	const client = await MongoClient.connect(MONGODB_URI);
	const dbName = MONGODB_URI.match(/^.*\/([a-zA-Z0-9_]+$)/u)[1];
	col = client.db(dbName).collection('games');
};

/*
	[7-10JQKA][CDHS]
	H = coeur
	C = trefle
	D = carreau
	S = pique
*/
const cardSet = [
	'7C', '8C', '9C', '10C', 'JC', 'QC', 'KC', 'AC',
	'7D', '8D', '9D', '10D', 'JD', 'QD', 'KD', 'AD',
	'7H', '8H', '9H', '10H', 'JH', 'QH', 'KH', 'AH',
	'7S', '8S', '9S', '10S', 'JS', 'QS', 'KS', 'AS',
];

const suits = ['H', 'C', 'D', 'S'];
const sortedCardNumbersNotTrump = ['7', '8', '9', 'J', 'Q', 'K', '10', 'A'];
const sortedCardNumbersTrump = ['7', '8', 'Q', 'K', '10', 'A', '9', 'J'];

const colors = ['blue', 'green', 'grey', 'purple', 'red', 'yellow'];


interface GameData {
	players: { name: string | null, token: string | null }[]
	hands: string[][] | null
	winnedCards: string[][] | null
	currentTrick: { player: number, card: string }[] | null
	lastTrick: { player: number, card: string }[] | null
	toDeal: string[] | null
	actions: { text: string, ticks: number }[]
	backColor: string
	lastFirstPlayer: number | null
}

const shuffle = (array: string[]) => {
	let currentIndex = array.length;

	// While there remain elements to shuffle...
	while (currentIndex !== 0) {
		// Pick a remaining element...
		const randomIndex = Math.floor(Math.random() * currentIndex);
		currentIndex -= 1;

		// And swap it with the current element.
		const temporaryValue = array[currentIndex];
		array[currentIndex] = array[randomIndex];
		array[randomIndex] = temporaryValue;
	}

	return array;
};

const makeid = (length: number) => {
	let result = '';
	const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	const charactersLength = characters.length;
	for (let i = 0; i < length; i++) {
		result += characters.charAt(Math.floor(Math.random() * charactersLength));
	}
	return result;
};

export default {
	Date: new GraphQLScalarType({
		name: 'Date',
		description: 'Date and time',
		serialize: function(value: number) { // Transformation avant envoi au client
			return moment(value).valueOf();
		},
		parseValue: function(value: number) { // Transformation d'une valeur de variable reçue du client
			return new Date(value);
		},
		parseLiteral: function(ast) { // Transformation d'une valeur incluse dans la requête du client
			if (ast.kind === Kind.INT) {
				return new Date(parseInt(ast.value, 10));
			}
			return null;
		},
	}),

	Query: {
		game: async (_: any, args: { id: string, token: string }) => {
			if (col === null) throw new Error("Collection non initialized");
			const gameData = await col.findOne({ _id: new ObjectID(args.id) });
			if (!gameData) throw new Error("Wrong id");
			const player = gameData.players.findIndex(({ token }) => token === args.token);
			if (player < 0) throw new Error("Wrong player");

			return {
				id: gameData._id,
				player,
				players: gameData.players.map(({ name }) => name),
				hand: gameData.hands && gameData.hands[player],
				currentTrick: gameData.currentTrick,
				winnedCards: gameData.winnedCards,
				actions: gameData.actions,
				backColor: gameData.backColor,
				lastFirstPlayer: gameData.lastFirstPlayer,
			};
		},
	},

	Mutation: {
		createGame: async () => {
			if (col === null) throw new Error("Collection non initialized");
			const res = await col.insertOne({
				players: [{ name: null, token: null }, { name: null, token: null }, { name: null, token: null }, { name: null, token: null }],
				hands: null,
				winnedCards: null,
				currentTrick: null,
				lastTrick: null,
				toDeal: [...cardSet],
				actions: [{ text: "Partie créée", ticks: Date.now() }],
				backColor: 'blue',
				lastFirstPlayer: null,
			});
			return res.insertedId;
		},
		joinGame: async (_: any, args: { gameId: string, player: number }) => {
			if (col === null) throw new Error("Collection non initialized");
			const gameData = await col.findOne({ _id: new ObjectID(args.gameId) });
			if (!gameData) throw new Error("Wrong gameId");
			if (![0, 1, 2, 3].includes(args.player)) throw new Error("Wrong player");
			const token = makeid(10);
			const players = gameData.players;
			players[args.player].token = token;
			await col.updateOne({ _id: gameData._id }, {
				$set: { players: players },
				// eslint-disable-next-line max-len
				$push: { actions: { $each: [{ text: "Nouveau joueur " + ('"' + (gameData.players[args.player].name || "joueur " + args.player) + '"'), ticks: Date.now() }], $slice: -100 } },
			});
			return token;
		},
		setBackColor: async (_: any, args: { gameId: string, token: string, color: string }) => {
			if (col === null) throw new Error("Collection non initialized");
			const gameData = await col.findOne({ _id: new ObjectID(args.gameId) });
			if (!gameData) throw new Error("Wrong gameId");
			const player = gameData.players.findIndex(({ token }) => token === args.token);
			if (player < 0) throw new Error("Wrong token");
			if (!colors.includes(args.color)) throw new Error("Wrong color");

			await col.updateOne({ _id: gameData._id }, {
				$set: { backColor: args.color },
				// eslint-disable-next-line max-len
				$push: { actions: { $each: [{ text: "Nouvelle couleur choisie par " + ('"' + (gameData.players[player].name || "joueur " + player) + '"'), ticks: Date.now() }], $slice: -100 } },
			});
			return true;
		},
		setPlayerName: async (_: any, args: { gameId: string, token: string, name: string }) => {
			if (col === null) throw new Error("Collection non initialized");
			const gameData = await col.findOne({ _id: new ObjectID(args.gameId) });
			if (!gameData) throw new Error("Wrong gameId");
			const player = gameData.players.findIndex(({ token }) => token === args.token);
			if (player < 0) throw new Error("Wrong token");

			const players = gameData.players;
			players[player].name = args.name;
			await col.updateOne({ _id: gameData._id }, {
				$set: { players: players },
				// eslint-disable-next-line max-len
				$push: { actions: { $each: [{ text: "Le joueur " + player + " a changé son nom pour " + ('"' + (gameData.players[player].name || "joueur " + player) + '"'), ticks: Date.now() }], $slice: -100 } },
			});
			return true;
		},
		shuffle: async (_: any, args: { gameId: string, token: string }) => {
			if (col === null) throw new Error("Collection non initialized");
			const gameData = await col.findOne({ _id: new ObjectID(args.gameId) });
			if (!gameData) throw new Error("Wrong gameId");
			const player = gameData.players.findIndex(({ token }) => token === args.token);
			if (player < 0) throw new Error("Wrong token");
			if (!gameData.toDeal || gameData.toDeal.length !== 32) throw new Error("Wrong game state");

			await col.updateOne({ _id: gameData._id }, {
				$set: { toDeal: shuffle(gameData.toDeal) },
				// eslint-disable-next-line max-len
				$push: { actions: { $each: [{ text: "Jeu mélangé par " + ('"' + (gameData.players[player].name || "joueur " + player) + '"'), ticks: Date.now() }], $slice: -100 } },
			});
			return true;
		},
		cut: async (_: any, args: { gameId: string, token: string, wherePercentage: number }) => {
			if (col === null) throw new Error("Collection non initialized");
			const gameData = await col.findOne({ _id: new ObjectID(args.gameId) });
			if (!gameData) throw new Error("Wrong gameId");
			const player = gameData.players.findIndex(({ token }) => token === args.token);
			if (player < 0) throw new Error("Wrong token");
			if (!gameData.toDeal || gameData.toDeal.length !== 32) throw new Error("Wrong game state");
			if (args.wherePercentage < 0 || args.wherePercentage > 100) throw new Error("Wrong given position");

			const pivot = Math.floor(Math.random() * 10) - 5 + Math.floor(args.wherePercentage / 100 * 33);
			if (pivot < 3 || pivot > 29) throw new Error("Wrong calculated position");
			await col.updateOne({ _id: gameData._id }, {
				$set: { toDeal: [...gameData.toDeal.slice(pivot), ...gameData.toDeal.slice(0, pivot)] },
				// eslint-disable-next-line max-len
				$push: { actions: { $each: [{ text: "Jeu coupé à " + args.wherePercentage + "% par " + ('"' + (gameData.players[player].name || "joueur " + player) + '"'), ticks: Date.now() }], $slice: -100 } },
			});
			return true;
		},
		deal: async (_: any, args: { gameId: string, token: string, by: number[], firstPlayer: number }) => {
			if (col === null) throw new Error("Collection non initialized");
			const gameData = await col.findOne({ _id: new ObjectID(args.gameId) });
			if (!gameData) throw new Error("Wrong gameId");
			const player = gameData.players.findIndex(({ token }) => token === args.token);
			if (player < 0) throw new Error("Wrong token");
			if (!gameData.toDeal || gameData.toDeal.length !== 32) throw new Error("Wrong game state");
			if (
				args.by.length !== 3
				|| args.by.some((nb) => nb !== 3 && nb !== 2)
				|| args.by.reduce((acc, cur) => acc + cur, 0) !== 8
			) throw new Error("Wrong split, try more in the middle");
			
			const hands: string[][] = [[], [], [], []];
			args.by.forEach((nb: number) => {
				for (let i = args.firstPlayer + 1; i <= args.firstPlayer + 4; i++) {
					hands[i % 4] = [...gameData.toDeal!.splice(0, nb), ...hands[i % 4]];
				}
			});
			await col.updateOne({ _id: gameData._id }, {
				$set: { toDeal: null, hands, currentTrick: [], winnedCards: [[], []], lastFirstPlayer: args.firstPlayer },
				// eslint-disable-next-line max-len
				$push: { actions: { $each: [{ text: "Cartes distribuées par " + ('"' + (gameData.players[player].name || "joueur " + player) + '"') + " en " + JSON.stringify(args.by) + " en commençant par " + ('"' + (gameData.players[args.firstPlayer].name || "joueur " + player) + '"'), ticks: Date.now() }], $slice: -100 } },
			});
			return true;
		},
		sortHand: async (_: any, args: { gameId: string, token: string, trump: string | null, reverse: boolean | null }) => {
			if (col === null) throw new Error("Collection non initialized");
			const gameData = await col.findOne({ _id: new ObjectID(args.gameId) });
			if (!gameData) throw new Error("Wrong gameId");
			const player = gameData.players.findIndex(({ token }) => token === args.token);
			if (player < 0) throw new Error("Wrong token");
			if (!gameData.hands) throw new Error("Wrong game state");
			if (args.trump !== null && !suits.includes(args.trump)) throw new Error("Wrong trump");
			
			// 0 = red, 1 = black
			const getCardColor = (card: string) => ({ H: 0, D: 0, C: 1, S: 1 } as any)[card.substr(-1)];
			
			const playerHand = gameData.hands[player];
			const suitsInHand = playerHand.reduce((acc, cur) => {
				const suit = cur.substr(-1);
				if (!acc.includes(suit)) acc.push(suit);
				return acc;
			}, [] as string[]);
			const nbColors = [0, 1].map((c) => suitsInHand.reduce((acc, cur) => acc + (getCardColor(cur) === c ? 1 : 0), 0));
			let lastColor: number | null =
				nbColors[0] === nbColors[1] ?
					null
					:
					nbColors.indexOf(Math.min(...nbColors))
			;

			const newPlayerHand: string[] = [];
			while (playerHand.length > 0) {
				// On cherche le symbol suivant
				const suit = (playerHand.find((c) => getCardColor(c) !== lastColor) || playerHand[0]).substr(-1);

				const cards:string[] = [];
				// eslint-disable-next-line no-constant-condition
				while (true) {
					const nextCardIndex = playerHand.findIndex((c) => c.substr(-1) === suit);
					if (nextCardIndex < 0) break;
					cards.push(...playerHand.splice(nextCardIndex, 1));
				}

				const reverseCoef = args.reverse ? -1 : 1;

				cards.sort((a, b) => {
					const aSuit = a.slice(-1);
					const bSuit = b.slice(-1);
					const aValue = a.substring(0, a.length - 1);
					const bValue = b.substring(0, b.length - 1);
					if (aSuit !== bSuit) throw new Error("Not same suit");
					if (aSuit === args.trump) return reverseCoef * (sortedCardNumbersTrump.indexOf(aValue) - sortedCardNumbersTrump.indexOf(bValue));
					return reverseCoef * (sortedCardNumbersNotTrump.indexOf(aValue) - sortedCardNumbersNotTrump.indexOf(bValue));
				});

				newPlayerHand.push(...cards);

				lastColor = getCardColor(newPlayerHand[newPlayerHand.length - 1]);
			}
			gameData.hands[player] = newPlayerHand;

			await col.updateOne({ _id: gameData._id }, {
				$set: { hands: gameData.hands },
				// eslint-disable-next-line max-len
				$push: { actions: { $each: [{ text: ('"' + (gameData.players[player].name || "joueur " + player) + '"') + " a trié ses cartes", ticks: Date.now() }], $slice: -100 } },
			});
			return true;
		},
		lookLastTrick: async (_: any, args: { gameId: string, token: string }) => {
			if (col === null) throw new Error("Collection non initialized");
			const gameData = await col.findOne({ _id: new ObjectID(args.gameId) });
			if (!gameData) throw new Error("Wrong gameId");
			const player = gameData.players.findIndex(({ token }) => token === args.token);
			if (player < 0) throw new Error("Wrong token");
			
			await col.updateOne({ _id: gameData._id }, {
				// eslint-disable-next-line max-len
				$push: { actions: { $each: [{ text: ('"' + (gameData.players[player].name || "joueur " + player) + '"') + " a regardé le dernier pli", ticks: Date.now() }], $slice: -100 } },
			});
			return gameData.lastTrick;
		},
		playCard: async (_: any, args: { gameId: string, token: string, card: string }) => {
			if (col === null) throw new Error("Collection non initialized");
			const gameData = await col.findOne({ _id: new ObjectID(args.gameId) });
			if (!gameData) throw new Error("Wrong gameId");
			const player = gameData.players.findIndex(({ token }) => token === args.token);
			if (player < 0) throw new Error("Wrong token");
			if (!gameData.currentTrick || !gameData.hands) throw new Error("Wrong game state");
			if (gameData.currentTrick.some((cp) => cp.player === player)) throw new Error("Already played");
			if (
				gameData.currentTrick.length > 0
				&& gameData.currentTrick[gameData.currentTrick.length - 1].player !== (player + 3) % 4
			) throw new Error("Not your turn");

			const cardIndex = gameData.hands[player].indexOf(args.card);
			if (cardIndex < 0) throw new Error("Wrong card");
			
			gameData.currentTrick.push({ player, card: args.card });
			gameData.hands[player].splice(cardIndex, 1);
			await col.updateOne({ _id: gameData._id }, {
				$set: { currentTrick: gameData.currentTrick, hands: gameData.hands },
				// eslint-disable-next-line max-len
				$push: { actions: { $each: [{ text: "Carte jouée par " + ('"' + (gameData.players[player].name || "joueur " + player) + '"'), ticks: Date.now() }], $slice: -100 } },
			});
			return true;
		},
		unplayCard: async (_: any, args: { gameId: string, token: string }) => {
			if (col === null) throw new Error("Collection non initialized");
			const gameData = await col.findOne({ _id: new ObjectID(args.gameId) });
			if (!gameData) throw new Error("Wrong gameId");
			const player = gameData.players.findIndex(({ token }) => token === args.token);
			if (player < 0) throw new Error("Wrong token");
			if (!gameData.currentTrick || !gameData.hands) throw new Error("Wrong game state");
			if (gameData.currentTrick.length === 0) throw new Error("No card played");
			if (gameData.currentTrick[gameData.currentTrick.length - 1].player !== player) throw new Error("Not last card player");
			
			gameData.hands[player].push(gameData.currentTrick.splice(gameData.currentTrick.length - 1, 1)[0].card);
			await col.updateOne({ _id: gameData._id }, {
				$set: { currentTrick: gameData.currentTrick, hands: gameData.hands },
				// eslint-disable-next-line max-len
				$push: { actions: { $each: [{ text: "Carte reprise par " + ('"' + (gameData.players[player].name || "joueur " + player) + '"'), ticks: Date.now() }], $slice: -100 } },
			});
			return true;
		},
		takeTrick: async (_: any, args: { gameId: string, token: string }) => {
			if (col === null) throw new Error("Collection non initialized");
			const gameData = await col.findOne({ _id: new ObjectID(args.gameId) });
			if (!gameData) throw new Error("Wrong gameId");
			const player = gameData.players.findIndex(({ token }) => token === args.token);
			if (player < 0) throw new Error("Wrong token");
			if (
				!gameData.currentTrick || gameData.currentTrick.length !== 4
				|| !gameData.winnedCards
				|| !gameData.hands
			) throw new Error("Wrong game state");

			gameData.winnedCards[player % 2] = [...gameData.currentTrick.map((pc) => pc.card), ...gameData.winnedCards[player % 2]];
			if (gameData.hands.every((h) => h.length === 0)) {
				// Partie finie
				await col.updateOne({ _id: gameData._id }, {
					$set: {
						hands: null,
						winnedCards: gameData.winnedCards,
						currentTrick: null,
						lastTrick: null,
					},
					// eslint-disable-next-line max-len
					$push: { actions: { $each: [{ text: "Dernier pli pris par " + ('"' + (gameData.players[player].name || "joueur " + player) + '"'), ticks: Date.now() }], $slice: -100 } },
				});
			}
			else {
				// Partie pas finie
				await col.updateOne({ _id: gameData._id }, {
					$set: {
						winnedCards: gameData.winnedCards,
						currentTrick: [],
						lastTrick: gameData.currentTrick,
					},
					// eslint-disable-next-line max-len
					$push: { actions: { $each: [{ text: "Pli pris par " + ('"' + (gameData.players[player].name || "joueur " + player) + '"'), ticks: Date.now() }], $slice: -100 } },
				});
			}
			return true;
		},
		untakeTrick: async (_: any, args: { gameId: string, token: string }) => {
			if (col === null) throw new Error("Collection non initialized");
			const gameData = await col.findOne({ _id: new ObjectID(args.gameId) });
			if (!gameData) throw new Error("Wrong gameId");
			const player = gameData.players.findIndex(({ token }) => token === args.token);
			if (player < 0) throw new Error("Wrong token");
			if (
				!gameData.currentTrick || gameData.currentTrick.length !== 0
				|| !gameData.lastTrick
				|| !gameData.winnedCards
			) throw new Error("Wrong game state");

			gameData.lastTrick.forEach(({ card }: { card: string}) => {
				[0, 1].forEach((team) => {
					const index = gameData.winnedCards![team].indexOf(card);
					if (index >= 0) gameData.winnedCards![team].splice(index, 1);
				});
			});
			await col.updateOne({ _id: gameData._id }, {
				$set: {
					winnedCards: gameData.winnedCards,
					currentTrick: gameData.lastTrick,
					lastTrick: null,
				},
				// eslint-disable-next-line max-len
				$push: { actions: { $each: [{ text: "Pli reposé par " + ('"' + (gameData.players[player].name || "joueur " + player) + '"'), ticks: Date.now() }], $slice: -100 } },
			});
			return true;
		},
		regroup: async (_: any, args: { gameId: string, token: string, order: number[] }) => {
			if (col === null) throw new Error("Collection non initialized");
			const gameData = await col.findOne({ _id: new ObjectID(args.gameId) });
			if (!gameData) throw new Error("Wrong gameId");
			const player = gameData.players.findIndex(({ token }) => token === args.token);
			if (player < 0) throw new Error("Wrong token");
			if (!Array.isArray(args.order) || ![...args.order].sort().every((o, i) => o === i)) throw new Error("Wrong order");

			const toRegroup = [
				...(!gameData.winnedCards ? [] : gameData.winnedCards),
				...(!gameData.hands ? [] : gameData.hands),
				...(!gameData.currentTrick ? [] : [gameData.currentTrick.map((pc) => pc.card)]),
			];
			if (toRegroup.reduce((acc, cur) => acc + cur.length, 0) !== 32) throw new Error("Wrong game state, not all cards winned or in hands");
			if (args.order.length !== toRegroup.length) throw new Error("Wrong order length, expected " + toRegroup.length);

			await col.updateOne({ _id: gameData._id }, {
				$set: {
					winnedCards: null,
					hands: null,
					currentTrick: null,
					lastTrick: null,
					toDeal: ([] as string[]).concat(...args.order.map((o) => toRegroup[o])),
				},
				// eslint-disable-next-line max-len
				$push: { actions: { $each: [{ text: "Jeu reformé (ordre " + JSON.stringify(args.order) + ") par " + ('"' + (gameData.players[player].name || "joueur " + player) + '"'), ticks: Date.now() }], $slice: -100 } },
			});

			return true;
		},
	},
};
