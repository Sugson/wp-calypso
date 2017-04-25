/**
 * External dependencies
 */
import React, { Component } from 'react';

/**
 * Internal dependencies
 */
import { cartItems } from 'lib/cart-values';
import { tlds } from 'lib/domains/constants';
import StepWrapper from 'signup/step-wrapper';
import SignupActions from 'lib/signup/actions';
import Button from 'components/button';
import Card from 'components/card';
// TODO: `design-type-with-store`, `design-type`, and this component could be refactored to reduce redundancy
import DomainImage from 'signup/steps/design-type-with-store/domain-image';
import PageImage from 'signup/steps/design-type-with-store/page-image';
import { externalRedirect } from 'lib/route/path';

export default class SiteOrDomain extends Component {
	componentWillMount() {
		if ( ! this.getDomainName() ) {
			// /domains domain search is an external application to calypso,
			// therefor a full redirect required:
			externalRedirect( '/domains' );
		}
	}

	getDomainName() {
		const { queryObject, step } = this.props;

		let domain, isValidDomain = false;

		if ( queryObject && queryObject.new ) {
			domain = queryObject.new;
		} else if ( step && step.domainItem ) {
			domain = step.domainItem.meta;
		}

		if ( domain ) {
			const domainParts = domain.split( '.' );

			if ( domainParts.length > 1 ) {
				const tld = domainParts.slice( 1 ).join( '.' );
				isValidDomain = !! tlds[ tld ];
			}
		}

		return isValidDomain && domain;
	}

	getChoices() {
		return [
			{
				type: 'page',
				label: 'Start a new site',
				image: <PageImage />,
				description: 'Choose a theme, customize, and launch your site. Free domain included with all plans.'
			},
			{
				type: 'domain',
				label: 'Just buy a domain',
				image: <DomainImage />,
				description: 'Show a "coming soon" notice on your domain. Add a site later.'
			},
		];
	}

	renderChoices() {
		return (
			<div className="site-or-domain__choices">
				{ this.getChoices().map( ( choice ) => (
					<div className="site-or-domain__choice" key={ choice.type }>
						<Card compact className="site-or-domain__choice-card">
							<a className="site-or-domain__choice-link"
								href="#"
								onClick={ ( event ) => this.handleClickChoice( event, choice.type ) }>
								{ choice.image }
							</a>
						</Card>
						<Card compact className="site-or-domain__choice-card">
							<div className="site-or-domain__choice-button">
								<Button onClick={ ( event ) => this.handleClickChoice( event, choice.type ) }>{ choice.label }</Button>
							</div>
							<p>{ choice.description }</p>
						</Card>
					</div>
				) ) }
			</div>
		);
	}

	handleClickChoice( event, designType ) {
		event.preventDefault();

		const {
			stepName,
			goToStep,
			goToNextStep,
		} = this.props;

		const domain = this.getDomainName();
		const tld = domain.split( '.' ).slice( 1 ).join( '.' );
		const domainItem = cartItems.domainRegistration( { productSlug: tlds[ tld ], domain } );

		SignupActions.submitSignupStep( {
			stepName,
			domainItem,
			designType,
			siteSlug: domain,
			siteUrl: domain,
			isPurchasingItem: true,
		}, [], { domainItem } );

		if ( designType === 'domain' ) {
			// we can skip the next two steps in the `domain-first` flow if the
			// user is only purchasing a domain
			SignupActions.submitSignupStep( { stepName: 'themes', wasSkipped: true }, [], {
				themeSlugWithRepo: 'pub/twentysixteen'
			} );
			SignupActions.submitSignupStep( { stepName: 'plans', wasSkipped: true }, [], { cartItem: null, privacyItem: null } );
			goToStep( 'user' );
		} else {
			goToNextStep();
		}
	}

	render() {
		return (
			<StepWrapper
				flowName={ this.props.flowName }
				stepName={ this.props.stepName }
				positionInFlow={ this.props.positionInFlow }
				headerText={ this.props.headerText }
				subHeaderText={ this.props.subHeaderText }
				fallbackHeaderText={ this.props.headerText }
				fallbackSubHeaderText={ this.props.subHeaderText }
				signupProgress={ this.props.signupProgress }
				stepContent={ this.renderChoices() } />
		);
	}
}
