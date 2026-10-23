### Changed

- Ambient occlusion reads the beauty pass's depth buffer instead of rendering the scene a second time for its normal/depth GBuffer. That prepass cost 537 extra draws and 2.6-2.9 ms/frame in Harbor Heat and 2,105 extra draws in Drift Foundry at 1600x900; AO now draws nothing of its own. A post chain whose antialiasing is `"smaa"` (the default) keeps SMAA and drops the beauty target's extra MSAA resolve, because WebGL2 cannot sample a multisampled depth texture; `"msaa"` chains keep the old prepass. Fixed-viewpoint captures differ only on geometry edges (#2173).
