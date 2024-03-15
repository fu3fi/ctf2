const fs = require('fs');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const crypto = require('crypto');
const { Graph } = require('./simpleGraph');
const express = require('express');


class NodeController {

	// OK
	constructor(config) {
		this.tasks = new Map();
		this.results = new Map();
		this.networkTokens = new Set();
		this.config = config;
		this.teamEthMap = config['teamEthMap'];
		this.nodeEth = config['nodeEth'];
		this.nodePort = config['nodePort'];
		this.hostEth = config['hostEth'];
		this.sudoPass = config['sudoPass'];

		(async() => {
			await this.iptables('ACCEPT')('FORWARD').all();
			await this.iptables('DROP')('FORWARD').mapping(Object.values(this.teamEthMap), Object.values(this.teamEthMap));
			await this.iptables('DROP')('FORWARD').mapping(Object.values(this.teamEthMap), [this.hostEth]);
			await this.iptables('DROP')('FORWARD').mapping(Object.values(this.teamEthMap), [this.nodeEth]);

			console.log("\nIptables has been configured")
		})();
	};


	// OK
	static getRandmonToken(tokens) {
		let str = Math.random().toFixed(5) + Math.random().toFixed(5);
		while (tokens.has(str)) {
			str = Math.random().toFixed(5) + Math.random().toFixed(5);
		}
		
		return {
			networkName: crypto.createHash('md5').update(str).digest('hex'),
			networkToken: str,
		};
	};

	setServerDate(date) {
		exec(`echo ${this.sudoPass} | sudo -S date --set="${date}"`);
	};

	// OK
	async createNetwork() {
		const MATCH_LENGTH = 10;

		const { networkName, networkToken } = NodeController.getRandmonToken(this.networkTokens);
		this.networkTokens.add(networkToken);

		const out0 = (await exec(`echo ${this.sudoPass} | sudo -S docker network ls | grep ${networkName} || echo -n ""`))['stdout'];

		if (out0 != '') {
			await exec(`echo ${this.sudoPass} | sudo -S docker network rm ${networkName}`);	
		}
		const networkId = (await exec(`echo ${this.sudoPass} | sudo -S docker network create -d bridge ${networkName}`))['stdout'];

		const interfaceName = (await exec(`ip addr | grep -Eo '[^[:space:]]+${networkId.slice(0, MATCH_LENGTH)}[^\:]*' | sed -n '1p'`))['stdout'];

		return {
			networkId: networkId.slice(0, -1),
			networkEth: interfaceName.slice(0, -1),
			networkName: networkName,
			networkToken: networkToken,
		};
	};

	// OK
	isNewTask(taskName) {
		if (this.tasks.has(taskName)) {
			return false;
		}
		return true;
	};

	// OK
	isUpdateTask(task) {
		const prevInfo = this.tasks.get(task['name']);

		if (
			JSON.stringify(prevInfo['teams']) == JSON.stringify(task['teams']) &&
			JSON.stringify(prevInfo['startTime']) == JSON.stringify(task['startTime']) &&
			JSON.stringify(prevInfo['finishTime']) == JSON.stringify(task['finishTime'])
		) {
			return false;
		}

		return true;
	};

	// OK
	async createTask(task) {
		if (this.isNewTask(task['name'])) {
			const { networkId, networkEth, networkName, networkToken}  = await this.createNetwork();
			const currentTime = Math.floor(Date.now() / 1000);


			const timeout = setTimeout(() => {
				this.runTask(
					task['name'], 
					this.getChainOfConnction(task['containers'], task['connections']).reverse(),
					task['connections'], 
					task['teams'].map((team) => this.teamEthMap[team]), 
					networkId, 
					networkEth,
					networkToken,
					task['finishTime'] - task['startTime']
				);
			}, (task['startTime'] - currentTime) * 1000);


			task['timeout'] = timeout;
			task['networkId'] = networkId;
			task['networkEth'] = networkEth;
			task['networkToken'] = networkToken;
			this.results.set(task['name'], []);
			this.tasks.set(task['name'], task);

			console.log(this.tasks);

			return;
		}

		if (this.isUpdateTask(task)) {
			this.updateTask(task);
		}
	};

	// 
	updateTask(task) {
		const currentTime = Math.floor(Date.now() / 1000);
		const prevTaskInfo = this.tasks.get(task['name']);

		if (currentTime > task['startTime'] || currentTime > prevTaskInfo['startTime']) {
			return;
		}
		
		clearTimeout(this.tasks.get(task['name'])['timeout']);
		const timeout = setTimeout(() => {
			this.runTask(
				task['name'], 
				this.getChainOfConnction(task['containers'], task['connections']).reverse(),
				task['connections'], 
				task['teams'].map((team) => this.teamEthMap[team]), 
				networkId, 
				networkEth,
				networkToken, 
				task['finishTime'] - task['startTime']
			);
		}, (task['startTime'] - currentTime) * 1000);
		this.tasks.delete(task['name']);

		task['timeout'] = timeout;
		task['networkId'] = prevTaskInfo['networkId'];
		task['networkEth'] = prevTaskInfo['networkEth'];
		task['networkToken'] = prevTaskInfo['networkToken'];
		this.tasks.set(task['name'], task);
	};

	// OK
	removeTask(taskName) {
		if (this.tasks.has(taskName)) {
			const currentTime = Math.floor(Date.now() / 1000);

			if (currentTime > this.tasks.get(taskName)['startTime']) {
				return;
			}
			clearTimeout(this.tasks.get(taskName)['timeout']);
			this.results.delete(taskName);
			this.tasks.delete(taskName);

			console.log(this.tasks);
		}
	};	

	// 
	updateResult(taskName, result, token) {
		if (NodeController.checkCorrectToken(token)) {
			this.results[taskName].push(result);
		}
	};

	// OK
	static checkCorrectToken(token) {
		return true;
	};

	// OK
	iptables(modeC) {
		const mode = modeC;
		const inversionMode = {
			'DROP': 'ACCEPT',
			'ACCEPT': 'DROP',
		}[mode];

		return function(typeC) {
			const manage = {};
			const type = typeC;

			manage.mapping = async function(sendEths, receiveEths) {
				for (const eth of sendEths) {
					await Promise.all(receiveEths.map(async (otherEth) => {
						console.log(`iptables -w -D ${type} -i ${eth} -o ${otherEth} -j ${inversionMode}`);
						return await exec(`echo war | sudo -S iptables -w -D${type} -i ${eth} -o ${otherEth} -j ${inversionMode}|| echo ""`);
					}));

					await Promise.all(receiveEths.map(async (otherEth) => {
						console.log(`iptables -w -A ${type} -i ${eth} -o ${otherEth} -j ${mode}`);
						return await exec(`echo war | sudo -S iptables -w -A ${type} -i ${eth} -o ${otherEth} -j ${mode}|| echo ""`);
					}));

					const crossing = [...new Set(sendEths)].filter(item => receiveEths.includes(item));
					if (crossing.length != 0) {
						await Promise.all(crossing.map(async (self) => {
							console.log(`iptables -w -D ${type} -i ${self} -o ${self} -j ${mode}`);
							console.log(`iptables -w -D ${type} -i ${self} -o ${self} -j ${inversionMode}`);
							await exec(`echo war | sudo -S iptables -w -D ${type} -i ${self} -o ${self} -j ${mode}|| echo ""`);
							await exec(`echo war | sudo -S iptables -w -D ${type} -i ${self} -o ${self} -j ${inversionMode}|| echo ""`);
						}));
					}
				};
			};

			manage.all = async () => {
				console.log(`iptables -w -P ${type} ${mode}`);
				exec(`echo war | sudo -S iptables -w -P ${type} ${mode}|| echo ""`);
			};
			return manage;
		}
	};

	// OK
	async runTask(taskName, chainOfConnction, connections, ethsOfTeams, networkId, networkEth, networkToken, timeOfLife) {
		const containersIdBuff = [];

		console.log(JSON.stringify(connections));
		console.log(chainOfConnction);

		for (const containerName of chainOfConnction) {
			containersIdBuff.push(await this.runContainer(containerName, networkId, connections, taskName));
		};

		await this.iptables('DROP')('FORWARD').mapping(Object.values(this.teamEthMap), [networkEth]);
		await this.iptables('ACCEPT')('FORWARD').mapping(ethsOfTeams, [networkEth]);

		setTimeout(async () => {
			await this.iptables('DROP')('FORWARD').mapping(ethsOfTeams, [networkEth]);
			await this.iptables('ACCEPT')('FORWARD').mapping(Object.values(this.teamEthMap), [networkEth]);
			await Promise.all(containersIdBuff.map(async (containerId) => {
				this.stopContainer(containerId);
			}));
			await exec(`for i in $(echo ${this.sudoPass} | sudo -S docker network inspect -f '{{range .Containers}}{{.Name}} {{end}}' ${networkId}); do docker network disconnect -f ${networkId} $i; done;`);	
			this.removeNetwork(networkId);
			this.results.delete(taskName);
			this.tasks.delete(taskName);
			this.tasks.delete(networkToken);
		}, timeOfLife*1000);
	};

	// OK
	async runContainer(containerName, networkId, connections, taskName) {
		console.log(`run ${containerName} connections: ${JSON.stringify(connections[containerName])}`)
		let buff = "";
		for (const connection of connections[containerName]) {
			buff += ` -e ${connection['envName']}="${await this.getContainerIpById(connection['container'])}"`;
		}
		const connectionsEnv = (connections[containerName].length == 0)? 
			`--add-host host.docker.internal:host-gateway -e NODE_PORT=${this.nodePort} -e TASK_NAME=${taskName}`: 
			`--add-host host.docker.internal:host-gateway -e NODE_PORT=${this.nodePort} -e TASK_NAME=${taskName}` + buff;
		const containerId = (await exec(`echo ${this.sudoPass} | sudo -S docker run -tid --network=${networkId} ${connectionsEnv} ${containerName}`))['stdout'].slice(0, -1);

		Object.keys(connections).forEach((recipient) => {
			connections[recipient].forEach((connection, i) => {
				if (connection['container'] == containerName) {
					connections[recipient][i]['container'] = containerId;
				}
			});
		});

		return containerId;
	};

	// OK
	removeNetwork(networkId) {
		exec(`echo ${this.sudoPass} | sudo -S docker network rm ${networkId}`);
	};

	// OK
	async getContainerIpById(containerId) {
		const containerIp = (await exec(`echo ${this.sudoPass} | sudo -S docker inspect ${containerId} | grep "IPAddress" | grep -Eo '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+'`))['stdout'].slice(0, -1);
		return containerIp;
	};

	// OK
	getChainOfConnction(containers, connections) {
		const graphOfConnecttion = new Graph();
		containers.forEach((node) => graphOfConnecttion.addVertex(node));

		console.log(JSON.stringify(connections));

		Object.keys(connections).forEach((recipient) => connections[recipient].forEach((sender) => graphOfConnecttion.addEdge(sender['container'], recipient)));
		return Object.keys(graphOfConnecttion.getTopologicalSort());
	};

	// OK
	stopContainer(containerId, sudoPass) {
		exec(`echo ${sudoPass} | sudo -S docker stop ${containerId}`);
	};
}

const config = JSON.parse(fs.readFileSync(__dirname + '/config.json'));
const port = config['nodePort'];
const nodeEth = config['nodeEth'];
const app = express();
let nodeController = null;

app.listen(port, () => {
	nodeController = new NodeController(config);
	console.log(`Node controller run on http://${nodeEth}:${port}`);
});

app.get('/createTask', async (req, res) => {
	await nodeController.createTask(JSON.parse(req.query['task']));
	res.send('OK');
});

app.get('/removeTask', (req, res) => {
	nodeController.removeTask(req.query['name']);
	res.send('OK');
});

app.get('/getResult', (req, res) => {
	res.send(nodeController.getResult());
});

app.get('/ping', (req, res) => {
	res.send('pong');
});

app.get('/updateResult', (req, res) => {
	updateResult(req.query['taskName'], req.query['result'], req.query['token']);
	res.send('OK');
});

// const result[taskName] = [
// 	{
// 		timePoint: 1241254,
// 		result: {
// 			DreamTeam: 10,
// 			f0xes: 20,
// 		}
// 	},
// 	{
// 		timePoint: 1241300,
// 		result: {
// 			DreamTeam: 50,
// 			f0xes: 20,
// 		}
// 	},
// ];



// const connections = {
//     "a": [
//         {
//             container: 'b',
//             envName: 'task-a',
//         },{
//            container: 'c',
//            envName: 'task-c',
//         },{
//            container: 'e',
//            envName: 'task-e',
//         },

//     ],
//     "b": [
//         {
//             container: 'd',
//             envName: 'task-d',
//         },
//     ],
//     "c": [
//         {
//             container: 'd',
//             envName: 'task-d',
//         },{
//             container: 'e',
//             envName: 'task-e',
//         },
//     ],
//     "d": [],
//     "e": [],
// }


