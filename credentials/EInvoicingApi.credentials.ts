import type { IAuthenticateGeneric, Icon, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

export class EInvoicingApi implements ICredentialType {
	name = 'eInvoicingApi';

	displayName = 'E-Invoicing API';

	icon: Icon = 'file:einvoicing.svg';

	documentationUrl = 'https://einvoiceengine.com/docs/authentication';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			placeholder: 'einv_test_…',
			description:
				'Sandbox keys start with einv_test_ (free, no billing), live keys with einv_live_. Create one at https://einvoiceengine.com/dashboard/keys.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://einvoiceengine.com',
			description: 'Change only for a self-hosted installation',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(/\\/$/, "")}}',
			url: '/v1/usage',
			method: 'GET',
		},
	};
}
