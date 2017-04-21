/**
 * External dependencies
 */
import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';

/**
 * Internal dependencies
 */
import VerificationCodeInput from './verification-code-input';
import WaitingTwoFactorNotificationApproval from './waiting-notification-approval';
import { getTwoFactorAuthType } from 'state/login/selectors';
import { localize } from 'i18n-calypso';

class Login2FA extends Component {
	static propTypes = {
		onSuccess: PropTypes.func.isRequired,
		twoFactorAuthType: PropTypes.string.isRequired,
	};

	render() {
		const { twoFactorAuthType, onSuccess } = this.props;
		return (
			<div>
				{
					twoFactorAuthType === 'push'
					? ( <WaitingTwoFactorNotificationApproval onSuccess={ onSuccess } /> )
					: ( <VerificationCodeInput onSuccess={ onSuccess } /> )
				}
			</div>
		);
	}
}

export default connect( ( state ) => ( {
	twoFactorAuthType: getTwoFactorAuthType( state ),
} ) )( localize( Login2FA ) );
