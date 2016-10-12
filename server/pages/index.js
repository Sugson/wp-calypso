/**
 * External dependencies
 */
import express from 'express';
import fs from 'fs';
import crypto from 'crypto';
import qs from 'qs';
import cookieParser from 'cookie-parser';
import debugFactory from 'debug';
import { join as pathJoin } from 'path';

/**
 * Internal dependencies
 */
import config from 'config';
import utils from 'bundler/utils';
import sectionsModule from '../../client/sections';
import { serverRouter } from 'isomorphic-routing';
import { serverRender } from 'render';
import { createReduxStore } from 'state';

const debug = debugFactory( 'calypso:pages' );

let HASH_LENGTH = 10,
	URL_BASE_PATH = '/calypso',
	SERVER_BASE_PATH = '/public';

const staticFiles = [
	{ path: 'style.css' },
	{ path: 'editor.css' },
	{ path: 'tinymce/skins/wordpress/wp-content.css' },
	{ path: 'style-debug.css' },
	{ path: 'style-rtl.css' },
	{ path: 'vendor.' + config( 'env' ) + '.js' }
];

let sections = sectionsModule.get();

/**
 * Generates a hash of a files contents to be used as a version parameter on asset requests.
 * @param {String} path Path to file we want to hash
 * @returns {String} A shortened md5 hash of the contents of the file file or a timestamp in the case of failure.
 **/
function hashFile( path ) {
	let data, hash,
		md5 = crypto.createHash( 'md5' );

	try {
		data = fs.readFileSync( path );
		md5.update( data );
		hash = md5.digest( 'hex' );
		hash = hash.slice( 0, HASH_LENGTH );
	} catch ( e ) {
		hash = new Date().getTime().toString();
	}

	return hash;
}

/**
 * Generate an object that maps asset names name to a server-relative urls.
 * Assets in request and static files are included.
 * @param {Object} request A request to check for assets
 * @returns {Object} Map of asset names to urls
 **/
function generateStaticUrls( request ) {
	const urls = {};

	function getUrl( filename, hash ) {
		return URL_BASE_PATH + '/' + filename + '?' + qs.stringify( {
			v: hash
		} );
	}

	staticFiles.forEach( function( file ) {
		if ( ! file.hash ) {
			file.hash = hashFile( process.cwd() + SERVER_BASE_PATH + '/' + file.path );
		}
		urls[ file.path ] = getUrl( file.path, file.hash );
	} );

	// vendor dll
	urls.vendor = urls[ 'vendor.' + config( 'env' ) + '.js' ];
	urls[ 'vendor-min' ] = urls.vendor.replace( '.js', '.m.js' );

	const assets = request.app.get( 'assets' );

	assets.forEach( function( asset ) {
		let name = asset.name;
		if ( ! name ) {
			// this is for auto-generated chunks that don't have names, like the commons chunk
			name = asset.url.replace( /\/calypso\/(\w+)\..*/, '_$1' );
		}
		urls[ name ] = asset.url;
		if ( config( 'env' ) !== 'development' ) {
			urls[ name + '-min' ] = asset.url.replace( '.js', '.m.js' );
		}
	} );

	return urls;
}

function getDefaultContext( request ) {
	const context = Object.assign( {}, request.context, {
		compileDebug: config( 'env' ) === 'development' ? true : false,
		urls: generateStaticUrls( request ),
		user: false,
		isDebug: request.query.debug !== undefined ? true : false,
		lang: config( 'i18n_default_locale_slug' ),
		jsFile: 'build',
		store: createReduxStore()
	} );

	context.app = {
		// use ipv4 address when is ipv4 mapped address
		clientIp: request.ip ? request.ip.replace( '::ffff:', '' ) : request.ip,
		isDebug: config( 'env' ) === 'development' || context.isDebug,
		tinymceWpSkin: context.urls[ 'tinymce/skins/wordpress/wp-content.css' ],
		tinymceEditorCss: context.urls[ 'editor.css' ]
	};

	return context;
}

function setUpLoggedOutRoute( req, res, next ) {
	req.context = getDefaultContext( req );
	res.set( {
		'X-Frame-Options': 'SAMEORIGIN'
	} );

	next();
}

function setUpLoggedInRoute( req, res, next ) {
	let redirectUrl, protocol, start, context;

	res.set( {
		'X-Frame-Options': 'SAMEORIGIN'
	} );

	context = getDefaultContext( req );

	if ( config( 'wpcom_user_bootstrap' ) ) {
		const user = require( 'user-bootstrap' );

		protocol = req.get( 'X-Forwarded-Proto' ) === 'https' ? 'https' : 'http';

		redirectUrl = config( 'login_url' ) + '?' + qs.stringify( {
			redirect_to: protocol + '://' + config( 'hostname' ) + req.originalUrl
		} );

		// if we don't have a wordpress cookie, we know the user needs to
		// authenticate
		if ( ! req.cookies.wordpress_logged_in ) {
			debug( 'User not logged in. Redirecting to %s', redirectUrl );
			res.redirect( redirectUrl );
			return;
		}
		start = new Date().getTime();

		debug( 'Issuing API call to fetch user object' );
		user( req.get( 'Cookie' ), function( error, data ) {
			let end, searchParam, errorMessage;

			if ( error ) {
				if ( error.error === 'authorization_required' ) {
					debug( 'User public API authorization required. Redirecting to %s', redirectUrl );
					res.redirect( redirectUrl );
				} else {
					if ( error.error ) {
						errorMessage = error.error + ' ' + error.message;
					} else {
						errorMessage = error.message;
					}

					console.log( 'API Error: ' + errorMessage );

					res.status( 500 ).render( '500', context );
				}

				return;
			}

			end = ( new Date().getTime() ) - start;

			debug( 'Rendering with bootstrapped user object. Fetched in %d ms', end );
			context.user = data;
			context.isRTL = data.isRTL ? true : false;

			if ( data.localeSlug ) {
				context.lang = data.localeSlug;
			}

			if ( req.path === '/' && req.query ) {
				searchParam = req.query.s || req.query.q;
				if ( searchParam ) {
					res.redirect( 'https://' + context.lang + '.search.wordpress.com/?q=' + encodeURIComponent( searchParam ) );
					return;
				}

				if ( req.query.newuseremail ) {
					debug( 'Detected legacy email verification action. Redirecting...' );
					res.redirect( 'https://wordpress.com/verify-email/?' + qs.stringify( req.query ) );
					return;
				}

				if ( req.query.action === 'wpcom-invite-users' ) {
					debug( 'Detected legacy invite acceptance action. Redirecting...' );
					res.redirect( 'https://wordpress.com/accept-invite/?' + qs.stringify( req.query ) );
					return;
				}
			}

			req.context = context;
			next();
		} );
	} else {
		req.context = context;
		next();
	}
}

function setUpRoute( req, res, next ) {
	if ( req.cookies.wordpress_logged_in ) {
		// the user is probably logged in
		setUpLoggedInRoute( req, res, next );
	} else {
		setUpLoggedOutRoute( req, res, next );
	}
}

function render404( request, response ) {
	response.status( 404 ).render( '404', {
		urls: generateStaticUrls( request )
	} );
}

module.exports = function() {
	const app = express();

	app.set( 'views', pathJoin( __dirname, '../../client/document' ) );

	app.use( cookieParser() );

	// redirect homepage if the Reader is disabled
	app.get( '/', function( request, response, next ) {
		if ( ! config.isEnabled( 'reader' ) ) {
			response.redirect( '/stats' );
		} else {
			next();
		}
	} );

	// redirects to handle old newdash formats
	app.use( '/sites/:site/:section', function( req, res, next ) {
		let redirectUrl;
		sections = [ 'posts', 'pages', 'sharing', 'upgrade', 'checkout', 'change-theme' ];

		if ( -1 === sections.indexOf( req.params.section ) ) {
			next();
			return;
		}
		if ( 'change-theme' === req.params.section ) {
			redirectUrl = req.originalUrl.replace( /^\/sites\/[0-9a-zA-Z\-\.]+\/change\-theme/, '/themes' );
		} else {
			redirectUrl = req.originalUrl.replace( /^\/sites\/[0-9a-zA-Z\-\.]+\/\w+/, '/' + req.params.section + '/' + req.params.site );
		}
		res.redirect( redirectUrl );
	} );

	if ( config( 'env' ) !== 'development' ) {
		app.get( '/discover', function( req, res, next ) {
			if ( ! req.cookies.wordpress_logged_in ) {
				res.redirect( config( 'discover_logged_out_redirect_url' ) );
			} else {
				next();
			}
		} );

		app.get( '/plans', function( req, res, next ) {
			if ( ! req.cookies.wordpress_logged_in ) {
				const queryFor = req.query && req.query.for;
				if ( queryFor && 'jetpack' === queryFor ) {
					res.redirect( 'https://wordpress.com/wp-login.php?redirect_to=https%3A%2F%2Fwordpress.com%2Fplans' );
				} else {
					res.redirect( 'https://wordpress.com/pricing' );
				}
			} else {
				next();
			}
		} );
	}

	app.get( '/theme', ( req, res ) => res.redirect( '/design' ) );

	sections
		.forEach( section => {
			section.paths.forEach( path => {
				const pathRegex = utils.pathToRegExp( path );

				app.get( pathRegex, function( req, res, next ) {
					if ( config.isEnabled( 'code-splitting' ) ) {
						req.context = Object.assign( {}, req.context, { chunk: section.name } );
					}
					next();
				} );

				if ( ! section.isomorphic ) {
					app.get( pathRegex, section.enableLoggedOut ? setUpRoute : setUpLoggedInRoute, serverRender );
				}
			} );

			if ( section.isomorphic ) {
				sectionsModule.require( section.module )( serverRouter( app, setUpRoute, section ) );
			}
		} );

	// catchall to render 404 for all routes not whitelisted in client/sections
	app.get( '*', render404 );

	return app;
};
