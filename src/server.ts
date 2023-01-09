// eslint-disable-next-line import/default
import express from 'express';
import { ApolloServer, gql } from 'apollo-server-express';
import schema from './schema';
import resolvers, { initializeCollection } from './resolvers';
// eslint-disable-next-line import/default
import moment from 'moment-timezone';

moment.tz.setDefault("Europe/Paris");
moment.locale('fr');


(async () => {
	await initializeCollection();

	const server = new ApolloServer({
		typeDefs: gql(schema),
		resolvers,
		debug: true,
	});
	const graphqlPath = '/graphql';


	// eslint-disable-next-line no-process-env
	console.log("process.env.PORT", process.env.PORT)
	const PORT = process.env.PORT || 3030;
	const app = express();

	await server.start()
	
	server.applyMiddleware({
		app: app,
		path: graphqlPath,
	});
	// eslint-disable-next-line import/no-named-as-default-member
	app.use('/', express.static('frontdist', {
		maxAge: 60 * 60 * 1000,
	}));
	// eslint-disable-next-line no-console
	app.listen(PORT, () => console.log(`Listening on port ${PORT}!`));
})();
