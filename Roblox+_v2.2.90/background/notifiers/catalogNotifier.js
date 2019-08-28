﻿/* background/notifiers/catalogNotifier.js [06/03/2017] */
RPlus.notifiers.catalog = (function () {
	var lastRegistration = 0;
	var maxTokenBackoff = 5 * 60 * 1000;
	var minTokenBackoff = 7500;
	var tokenBackoff = minTokenBackoff;
	var tokenExpiration = 30 * 60 * 1000;

	function updateToken() {
		storage.get("itemNotifier", function (itemNotifierOn) {
			if (!itemNotifierOn) {
				setTimeout(updateToken, minTokenBackoff);
				return;
			}

			Roblox.users.getAuthenticatedUser().then(function (user) {
				chrome.instanceID.getToken({ authorizedEntity: "303497097698", scope: "FCM" }, function (token) {
					$.post("https://api.roblox.plus/v2/itemnotifier/registertoken", {
						token: token,
						robloxUserId: user ? user.id : null
					}).done(function () {
						tokenBackoff = minTokenBackoff;
						lastRegistration = +new Date;
						setTimeout(updateToken, tokenExpiration);
					}).fail(function () {
						tokenBackoff = Math.min(maxTokenBackoff, tokenBackoff * 2);
						setTimeout(updateToken, tokenBackoff);
					});
				});
			}).catch(function () {
				tokenBackoff = Math.min(maxTokenBackoff, tokenBackoff * 2);
				setTimeout(updateToken, tokenBackoff);
			});
		});
	}

	function processNotification(notification) {
		var assetId = NaN;

		var metadata = {};

		if (notification.url) {
			metadata.url = notification.url;
			assetId = Roblox.catalog.getIdFromUrl(notification.url) || NaN;
			if (!isNaN(assetId)) {
				var notifierSounds = storage.get("notifierSounds") || {};
				metadata.robloxSound = (notification.title || "").toLowerCase().includes("it's free")
					? 130771265
					: Number(notifierSounds.item) || 205318910;
			}
		}

		$.notification({
			title: notification.title || "Roblox+ Catalog Notifier",
			context: notification.message || "",
			icon: notification.icon || ext.manifest.icons['48'],
			buttons: notification.buttons || [],
			items: notification.items || {},
			clickable: true,
			metadata: metadata
		}).buttonClick(function (index) {
			delete metadata.robloxSound;
			var notification = this;

			if (!isNaN(assetId) && notification.buttons[index].includes("Buy for")) {
				notification.close();
				var start = performance.now();
				var purchaseFailed = function (e) {
					$.notification({
						title: "Purchase failed",
						icon: notification.icon,
						context: e[0] && e[0].message ? e[0].message : "Unknown issue",
						clickable: true,
						metadata: metadata
					});
				};
				Roblox.catalog.getAssetInfo(assetId).then(function (asset) {
					// Use the price from the notification - worst case scenario it fails but we don't want to charge the user more than they think they're being charged.
					Roblox.economy.purchaseProduct(asset.productId, pround(notification.items.Price)).then(function (receipt) {
						console.log("Purchased!", receipt);
						var speed = performance.now() - start;
						$.notification({
							title: "Purchased!",
							context: asset.name,
							items: speed > 0 ? {
								"Speed": speed.toFixed(3) + "ms"
							} : {},
							icon: notification.icon,
							clickable: true,
							metadata: metadata
						});
					}).catch(purchaseFailed);
				}).catch(purchaseFailed);
			}
		});
	}

	function processMessage(message) {
		console.log("Message from: " + message.from, message);

		if (message.from === "/topics/catalog-notifier" || message.from === "/topics/catalog-notifier-premium") {
			if (message.data && message.data.notification) {
				storage.get("itemNotifier", function (itemNotifierOn) {
					if(!itemNotifierOn) {
						return;
					}

					try {
						processNotification(JSON.parse(message.data.notification));
					} catch (e) {
						console.error("Failed to parse notification.", message);
					}
				});
			}
		} else if (message.from === "/topics/catalog-notifier-freebies") {
			try {
				storage.get("autoTakeFreeItems", function (autoTake) {
					if(!autoTake) {
						return;
					}
					
					console.log("IT'S FREE!", message.data);
					Roblox.economy.purchaseProduct(Number(message.data.productId), 0).then(function (receipt) {
						console.log("Got me a freebie", receipt);

						var notification = {
							title: "Purchased new free item!",
							context: message.data.name,
							clickable: true,
							metadata: {}
						};

						if (message.data.itemType === "Asset") {
							notification.icon = Roblox.thumbnails.getAssetThumbnailUrl(Number(message.data.id), 4);
							notification.metadata.url = "https://www.roblox.com/catalog/" + message.data.id + "/Roblox-Plus";
						} else if (message.data.itemType === "Bundle") {
							notification.metadata.url = "https://www.roblox.com/bundles/" + message.data.id + "/Roblox-Plus";
						}

						$.notification(notification);
					}).catch(function (e) {
						console.error("Did a new item really come out? Why did this fail to purchase?", e);
					});
				});
			} catch (e) {
				console.error("Failed to parse asset.", message);
			}
		}
	}
	
	chrome.gcm.onMessage.addListener(processMessage);
	chrome.instanceID.onTokenRefresh.addListener(updateToken);

	ipc.on("catalogNotifier:testBuyButton", function () {
		processMessage({
			data: {
				notification: {
					title: "New Limited",
					message: "Noob Assist: S'mores Snacker",
					items: {
						"Price": "R$75",
						"Sales": "5000/10000"
					},
					buttons: ["Buy for R$75"],
					icon: "https://www.roblox.com/asset-thumbnail/image?width=110&height=110&assetId=904518348",
					url: "https://www.roblox.com/catalog/904518348/Noob-Assist-Smores-Snacker"
				}
			},
			from: "/topics/catalog-notifier-premium"
		});
	});
	
	function init() {
		updateToken();
	}

	init();

	return {
		processMessage: processMessage,
		updateToken: updateToken,
		getLastRegistration: function () {
			return new Date(lastRegistration);
		}
	};
})();


// WebGL3D
