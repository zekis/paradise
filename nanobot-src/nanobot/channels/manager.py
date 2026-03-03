"""Channel manager for coordinating chat channels."""

from __future__ import annotations

import asyncio
from typing import Any

from loguru import logger

from nanobot.bus.events import OutboundMessage
from nanobot.bus.queue import MessageBus
from nanobot.channels.base import BaseChannel
from nanobot.config.schema import Config


class ChannelManager:
    """
    Manages chat channels and coordinates message routing.
    
    Responsibilities:
    - Initialize enabled channels (Telegram, WhatsApp, etc.)
    - Start/stop channels
    - Route outbound messages
    """
    
    def __init__(self, config: Config, bus: MessageBus):
        self.config = config
        self.bus = bus
        self.channels: dict[str, BaseChannel] = {}
        self._dispatch_task: asyncio.Task | None = None
        
        self._init_channels()
    
    # (config_attr, module_path, class_name, extra_kwargs_factory)
    # extra_kwargs_factory is an optional callable(self) -> dict for channels
    # that need constructor arguments beyond (channel_config, bus).
    _CHANNEL_DEFS: list[
        tuple[str, str, str, Any]
    ] = [
        ("telegram", "nanobot.channels.telegram", "TelegramChannel",
         lambda self: {"groq_api_key": self.config.providers.groq.api_key}),
        ("whatsapp", "nanobot.channels.whatsapp", "WhatsAppChannel", None),
        ("discord",  "nanobot.channels.discord",  "DiscordChannel",  None),
        ("feishu",   "nanobot.channels.feishu",   "FeishuChannel",   None),
        ("mochat",   "nanobot.channels.mochat",   "MochatChannel",   None),
        ("dingtalk", "nanobot.channels.dingtalk", "DingTalkChannel", None),
        ("email",    "nanobot.channels.email",    "EmailChannel",    None),
        ("slack",    "nanobot.channels.slack",    "SlackChannel",    None),
        ("qq",       "nanobot.channels.qq",       "QQChannel",       None),
    ]

    def _init_channels(self) -> None:
        """Initialize channels based on config.

        Each channel import is guarded by a try/except ImportError block.
        This is intentional: channels have optional third-party dependencies
        (e.g. python-telegram-bot, python-socketio) that may not be installed.
        A missing dependency should never crash the application -- we log a
        warning and gracefully skip the unavailable channel.
        """
        import importlib

        for name, module_path, class_name, extra_kwargs_fn in self._CHANNEL_DEFS:
            channel_config = getattr(self.config.channels, name)
            if not channel_config.enabled:
                continue

            try:
                module = importlib.import_module(module_path)
                cls = getattr(module, class_name)
                extra_kwargs = extra_kwargs_fn(self) if extra_kwargs_fn else {}
                self.channels[name] = cls(channel_config, self.bus, **extra_kwargs)
                logger.info("{} channel enabled", name.capitalize())
            except ImportError as e:
                # Intentional swallow: optional dependency missing (see docstring)
                logger.warning("{} channel not available: {}", name.capitalize(), e)
    
    async def _start_channel(self, name: str, channel: BaseChannel) -> None:
        """Start a channel and log any exceptions."""
        try:
            await channel.start()
        except Exception as e:
            logger.error("Failed to start channel {}: {}", name, e)

    async def start_all(self) -> None:
        """Start all channels and the outbound dispatcher."""
        if not self.channels:
            logger.warning("No channels enabled")
            return
        
        # Start outbound dispatcher
        self._dispatch_task = asyncio.create_task(self._dispatch_outbound())
        
        # Start channels
        tasks = []
        for name, channel in self.channels.items():
            logger.info("Starting {} channel...", name)
            tasks.append(asyncio.create_task(self._start_channel(name, channel)))
        
        # Wait for all to complete (they should run forever)
        await asyncio.gather(*tasks, return_exceptions=True)
    
    async def stop_all(self) -> None:
        """Stop all channels and the dispatcher."""
        logger.info("Stopping all channels...")
        
        # Stop dispatcher
        if self._dispatch_task:
            self._dispatch_task.cancel()
            try:
                await self._dispatch_task
            except asyncio.CancelledError:
                pass
        
        # Stop all channels
        for name, channel in self.channels.items():
            try:
                await channel.stop()
                logger.info("Stopped {} channel", name)
            except Exception as e:
                logger.error("Error stopping {}: {}", name, e)
    
    async def _dispatch_outbound(self) -> None:
        """Dispatch outbound messages to the appropriate channel."""
        logger.info("Outbound dispatcher started")
        
        while True:
            try:
                msg = await asyncio.wait_for(
                    self.bus.consume_outbound(),
                    timeout=1.0
                )
                
                if msg.metadata.get("_progress"):
                    if msg.metadata.get("_tool_hint") and not self.config.channels.send_tool_hints:
                        continue
                    if not msg.metadata.get("_tool_hint") and not self.config.channels.send_progress:
                        continue
                
                channel = self.channels.get(msg.channel)
                if channel:
                    try:
                        await channel.send(msg)
                    except Exception as e:
                        logger.error("Error sending to {}: {}", msg.channel, e)
                else:
                    logger.warning("Unknown channel: {}", msg.channel)
                    
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break
    
    def get_channel(self, name: str) -> BaseChannel | None:
        """Get a channel by name."""
        return self.channels.get(name)
    
    def get_status(self) -> dict[str, Any]:
        """Get status of all channels."""
        return {
            name: {
                "enabled": True,
                "running": channel.is_running
            }
            for name, channel in self.channels.items()
        }
    
    @property
    def enabled_channels(self) -> list[str]:
        """Get list of enabled channel names."""
        return list(self.channels.keys())
