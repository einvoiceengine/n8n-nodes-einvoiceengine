import {
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type IHttpRequestOptions,
	type INodeExecutionData,
	type INodeProperties,
	type INodeType,
	type INodeTypeDescription,
	type JsonObject,
} from 'n8n-workflow';

const CONVERT_TARGETS = [
	{ name: 'CII (UN/CEFACT Cross Industry Invoice)', value: 'cii' },
	{ name: 'EN 16931 CII', value: 'en16931-cii' },
	{ name: 'EN 16931 UBL', value: 'en16931-ubl' },
	{ name: 'Facturae 3.2.2', value: 'facturae' },
	{ name: 'KSeF FA(3)', value: 'ksef' },
	{ name: 'Peppol BIS Billing 3.0', value: 'peppol-bis-billing' },
	{ name: 'UBL 2.1', value: 'ubl' },
	{ name: 'XRechnung CII', value: 'xrechnung-cii' },
	{ name: 'XRechnung UBL', value: 'xrechnung-ubl' },
	{ name: 'ZUGFeRD / Factur-X PDF', value: 'zugferd-facturx' },
];

const LANGS = [
	{ name: 'Dutch', value: 'nl' },
	{ name: 'English', value: 'en' },
	{ name: 'French', value: 'fr' },
	{ name: 'German', value: 'de' },
	{ name: 'Italian', value: 'it' },
	{ name: 'Polish', value: 'pl' },
	{ name: 'Portuguese', value: 'pt' },
	{ name: 'Spanish', value: 'es' },
];

const docInput: INodeProperties[] = [
	{
		displayName: 'Input',
		name: 'inputSource',
		type: 'options',
		options: [
			{ name: 'Binary File', value: 'binary', description: 'XML or PDF from a binary property (e.g. from Read File, HTTP Request or an email attachment)' },
			{ name: 'XML Text', value: 'text', description: 'XML as text, e.g. from an expression' },
		],
		default: 'binary',
	},
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		default: 'data',
		required: true,
		displayOptions: { show: { inputSource: ['binary'] } },
		description: 'Name of the binary property that holds the invoice (XML or ZUGFeRD / Factur-X PDF)',
	},
	{
		displayName: 'XML',
		name: 'xml',
		type: 'string',
		typeOptions: { rows: 6 },
		default: '',
		required: true,
		displayOptions: { show: { inputSource: ['text'] } },
		description: 'The invoice XML',
	},
];

export class EInvoicing implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'E-Invoicing',
		name: 'eInvoicing',
		icon: 'file:einvoicing.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Validate, parse, convert and repair EU e-invoices (XRechnung, EN 16931, Peppol, ZUGFeRD / Factur-X, Facturae, KSeF)',
		defaults: { name: 'E-Invoicing' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'eInvoicingApi', required: true }],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Validate',
						value: 'validate',
						action: 'Validate an invoice',
						description: 'Check an invoice with the official rules of its format and get findings with explanations',
					},
					{
						name: 'Parse to JSON',
						value: 'parse',
						action: 'Parse an invoice to JSON',
						description: 'Read an invoice into the EN 16931 JSON model',
					},
					{
						name: 'Convert',
						value: 'convert',
						action: 'Convert an invoice',
						description: 'Convert to another format, validated and round-trip checked',
					},
					{
						name: 'Repair',
						value: 'repair',
						action: 'Repair a rejected invoice',
						description: 'Explain a rejection, or apply field changes and get the fixed invoice back',
					},
				],
				default: 'validate',
			},
			...docInput,
			{
				displayName: 'Target Format',
				name: 'target',
				type: 'options',
				options: CONVERT_TARGETS,
				default: 'cii',
				required: true,
				displayOptions: { show: { operation: ['convert'] } },
			},
			{
				displayName: 'Repair Mode',
				name: 'repairMode',
				type: 'options',
				options: [
					{ name: 'Analyze', value: 'analyze', description: 'Failing rules, the fields involved and repair proposals; nothing is changed' },
					{ name: 'Apply Changes', value: 'apply', description: 'Apply field changes or proposals and return the fixed invoice' },
				],
				default: 'analyze',
				displayOptions: { show: { operation: ['repair'] } },
			},
			{
				displayName: 'Rejection Message',
				name: 'rejectionMessage',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				displayOptions: { show: { operation: ['repair'], repairMode: ['analyze'] } },
				description: 'Optional text of the rejection you received; rule IDs in it are picked up',
			},
			{
				displayName: 'Changes',
				name: 'changes',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				placeholder: 'Add Change',
				default: {},
				displayOptions: { show: { operation: ['repair'], repairMode: ['apply'] } },
				options: [
					{
						displayName: 'Change',
						name: 'change',
						values: [
							{ displayName: 'Field', name: 'field', type: 'string', default: '', placeholder: 'buyerReference', description: 'Field path in the EN 16931 JSON model, as named by Analyze' },
							{ displayName: 'Value', name: 'value', type: 'string', default: '' },
						],
					},
				],
			},
			{
				displayName: 'Accept Proposals',
				name: 'accept',
				type: 'string',
				default: '',
				displayOptions: { show: { operation: ['repair'], repairMode: ['apply'] } },
				description: 'Comma-separated proposal IDs from Analyze to apply',
			},
			{
				displayName: 'Apply Safe Proposals',
				name: 'applySafe',
				type: 'boolean',
				default: false,
				displayOptions: { show: { operation: ['repair'], repairMode: ['apply'] } },
				description: 'Whether to apply every proposal of category "safe"',
			},
			{
				displayName: 'Amounts Confirmed',
				name: 'confirmAmounts',
				type: 'boolean',
				default: false,
				displayOptions: { show: { operation: ['repair'], repairMode: ['apply'] } },
				description:
					'Whether a person has confirmed changes to amounts, tax data or bank and party identifiers. Without it such changes are refused.',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Allow Data Loss',
						name: 'allowDataLoss',
						type: 'boolean',
						default: false,
						description: 'Whether to convert even when the target format cannot hold every field',
						displayOptions: { show: { '/operation': ['convert', 'repair'] } },
					},
					{
						displayName: 'Language',
						name: 'lang',
						type: 'options',
						options: LANGS,
						default: 'en',
						description: 'Language of explanations and suggestions in findings',
					},
					{
						displayName: 'Output Binary Field',
						name: 'outputBinaryPropertyName',
						type: 'string',
						default: 'data',
						description: 'Binary property for the converted or repaired file',
						displayOptions: { show: { '/operation': ['convert', 'repair'] } },
					},
					{
						displayName: 'Output File Name',
						name: 'fileName',
						type: 'string',
						default: '',
						placeholder: 'invoice.xml',
						description: 'File name of the converted or repaired file (default: from the input file)',
						displayOptions: { show: { '/operation': ['convert', 'repair'] } },
					},
					{
						displayName: 'Rule Set Version',
						name: 'rules',
						type: 'string',
						default: '',
						placeholder: 'latest',
						description: 'Pin a rule-set bundle (e.g. 2026-11); empty uses the latest',
						displayOptions: { show: { '/operation': ['validate'] } },
					},
					{
						displayName: 'Store Document',
						name: 'store',
						type: 'boolean',
						default: false,
						description: 'Whether to keep the document in your account (off: processed and discarded)',
					},
					{
						displayName: 'ZUGFeRD Profile',
						name: 'profile',
						type: 'options',
						options: [
							{ name: 'EN 16931', value: 'EN 16931' },
							{ name: 'EXTENDED', value: 'EXTENDED' },
							{ name: 'XRECHNUNG', value: 'XRECHNUNG' },
						],
						default: 'EN 16931',
						description: 'Profile of a ZUGFeRD / Factur-X PDF',
						displayOptions: { show: { '/operation': ['convert'] } },
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const out: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('eInvoicingApi');
		const baseUrl = String(credentials.baseUrl || 'https://einvoiceengine.com').replace(/\/$/, '');
		// Same key for retries of the same item in the same execution, so a retry is never billed twice.
		const executionId = this.getExecutionId();

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;
				const options = this.getNodeParameter('options', i, {}) as IDataObject;

				// Read the document as JSON { document, encoding }; every endpoint accepts that form.
				const source = this.getNodeParameter('inputSource', i) as string;
				let document: string;
				let encoding: 'utf8' | 'base64';
				let inputName = 'invoice.xml';
				if (source === 'binary') {
					const prop = this.getNodeParameter('binaryPropertyName', i) as string;
					const meta = this.helpers.assertBinaryData(i, prop);
					const buf = await this.helpers.getBinaryDataBuffer(i, prop);
					const isPdf = buf.subarray(0, 4).toString('latin1') === '%PDF';
					document = isPdf ? buf.toString('base64') : buf.toString('utf8');
					encoding = isPdf ? 'base64' : 'utf8';
					if (meta.fileName) inputName = meta.fileName;
				} else {
					document = this.getNodeParameter('xml', i) as string;
					encoding = 'utf8';
					if (!document.trim()) throw new NodeOperationError(this.getNode(), 'XML is empty', { itemIndex: i });
				}

				const qs: IDataObject = { store: options.store === true };
				if (options.lang) qs.lang = options.lang;
				const body: IDataObject = { document, encoding };
				let path: string;
				let idempotent = true;
				let returnsDocument = false;

				if (operation === 'validate') {
					path = '/v1/invoices/validate';
					if (options.rules) qs.rules = options.rules;
				} else if (operation === 'parse') {
					path = '/v1/invoices/parse';
				} else if (operation === 'convert') {
					path = '/v1/invoices/convert';
					body.target = this.getNodeParameter('target', i) as string;
					if (body.target === 'zugferd-facturx' && options.profile) body.profile = options.profile;
					if (options.allowDataLoss) body.allowDataLoss = true;
					returnsDocument = true;
				} else if (operation === 'repair') {
					const mode = this.getNodeParameter('repairMode', i) as string;
					if (mode === 'analyze') {
						path = '/v1/invoices/fix/analyze';
						idempotent = false;
						delete qs.store;
						const message = this.getNodeParameter('rejectionMessage', i, '') as string;
						if (message) body.message = message;
					} else {
						path = '/v1/invoices/fix';
						const changes = (this.getNodeParameter('changes.change', i, []) as Array<{ field: string; value: string }>).filter((c) => c.field);
						const accept = (this.getNodeParameter('accept', i, '') as string)
							.split(',')
							.map((s) => s.trim())
							.filter(Boolean);
						if (changes.length) body.changes = changes;
						if (accept.length) body.accept = accept;
						if (this.getNodeParameter('applySafe', i, false)) body.applySafe = true;
						if (this.getNodeParameter('confirmAmounts', i, false)) body.confirmAmounts = true;
						if (options.allowDataLoss) body.allowDataLoss = true;
						if (!changes.length && !accept.length && !body.applySafe)
							throw new NodeOperationError(this.getNode(), 'Add at least one change, a proposal ID or turn on Apply Safe Proposals', { itemIndex: i });
						returnsDocument = true;
					}
				} else {
					throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, { itemIndex: i });
				}

				const request: IHttpRequestOptions = {
					method: 'POST',
					url: `${baseUrl}${path}`,
					qs,
					body,
					json: true,
					headers: idempotent && executionId ? { 'Idempotency-Key': `n8n-${executionId}-${this.getNode().id}-${i}` } : {},
				};
				const response = (await this.helpers.httpRequestWithAuthentication.call(this, 'eInvoicingApi', request)) as IDataObject;

				const item: INodeExecutionData = { json: response, pairedItem: { item: i } };
				const target = response.target as IDataObject | undefined;
				if (returnsDocument && typeof response.document === 'string') {
					const isBase64 = target?.encoding === 'base64';
					const data = Buffer.from(response.document, isBase64 ? 'base64' : 'utf8');
					const mimeType = String(target?.mediaType ?? (isBase64 ? 'application/pdf' : 'application/xml'));
					const ext = mimeType.includes('pdf') ? 'pdf' : 'xml';
					const fileName = (options.fileName as string) || `${inputName.replace(/\.[^.]+$/, '')}${operation === 'repair' ? '-fixed' : `-${String(body.target)}`}.${ext}`;
					const prop = (options.outputBinaryPropertyName as string) || 'data';
					item.binary = { [prop]: await this.helpers.prepareBinaryData(data, fileName, mimeType) };
					const { document: _omit, ...rest } = response;
					void _omit;
					item.json = rest;
				}
				out.push(item);
			} catch (error) {
				if (this.continueOnFail()) {
					const e = error as { message?: string; description?: string; httpCode?: string };
					out.push({ json: { error: e.message, description: e.description, httpCode: e.httpCode }, pairedItem: { item: i } });
					continue;
				}
				if (error instanceof NodeOperationError) throw new NodeOperationError(this.getNode(), error, { itemIndex: i });
				throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
			}
		}
		return [out];
	}
}
