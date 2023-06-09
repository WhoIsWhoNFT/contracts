// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

///-------------------------------------------------------------------
///  __          ___          _____  __          ___
///  \ \        / / |        |_   _| \ \        / / |
///   \ \  /\  / /| |__   ___  | |  __\ \  /\  / /| |__   ___
///    \ \/  \/ / | '_ \ / _ \ | | / __\ \/  \/ / | '_ \ / _ \
///     \  /\  /  | | | | (_) || |_\__ \\  /\  /  | | | | (_) |
///      \/  \/   |_| |_|\___/_____|___/ \/  \/   |_| |_|\___/
///
///-------------------------------------------------------------------
///
/// wagmi

import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "./ERC721Base.sol";

error WhoIsWho__ZeroMintAmount();
error WhoIsWho__MaxMint();
error WhoIsWho__InsufficientFunds();
error WhoIsWho__StageNotReady();
error WhoIsWho__InvalidProof();
error WhoIsWho__NonExistentTokenId();

contract WhoIsWhoERC721 is ERC721Base, ReentrancyGuard {
    using Strings for uint256;

    enum SaleStage {
        IDLE,
        PRESALE_OG,
        PRESALE_WL,
        PUBLIC_SALE
    }

    ///////////////////////////////////////////////
    /// Constants
    //////////////////////////////////////////////

    /// Presale price for OG members
    uint256 public constant PRESALE_PRICE_OG = 0.025 ether;

    /// Presale price for whitelist members
    uint256 public constant PRESALE_PRICE_WL = 0.025 ether;

    /// Total supply
    uint32 public constant TOTAL_SUPPLY = 5000;

    /// Interval for OG members to mint their token during presale
    uint16 public constant PRESALE_INTERVAL = 15 minutes;

    /// Number of reserved tokens
    uint16 public constant RESERVED_TOKENS = 50;

    /// Max number of tokens per OG wallet
    uint16 public constant PRESALE_MAX_TOKEN_PER_OG = 3;

    /// Max number of tokens per WL wallet
    uint16 public constant PRESALE_MAX_TOKEN_PER_WL = 2;

    ///////////////////////////////////////////////
    /// Storage
    //////////////////////////////////////////////

    /// Price per token for public sale
    uint256 public price;

    /// Presale Date
    uint64 public presaleDate;

    /// Public sale date
    uint64 public publicSaleDate;

    /// Reveal Date
    uint64 public revealDate;

    /// Max token per wallet for public sale
    uint32 public maxTokenPerWallet;

    /// Merkle roots for OG
    bytes32 public ogMerkleRoot;

    /// Merkle roots for whitelist members
    bytes32 public wlMerkleRoot;

    /// Metadata URI
    string public metadataBaseURI;

    /// Owner's balance during public sale
    mapping(address => uint256) public publicSaleBalances;

    ///////////////////////////////////////////////
    /// Events
    //////////////////////////////////////////////

    event SetPrice(uint256 indexed _price);

    event SetMaxTokenPerWallet(uint256 indexed _maxTokenPerWallet);

    event SetMetadataBaseURI(string indexed _uri);

    event SetOgMerkleRoot(bytes32 indexed _merkleRoot);

    event SetWlMerkleRoot(bytes32 indexed _merkleRoot);

    event SetPresaleDate(uint64 indexed _date);

    event SetPublicSaleDate(uint64 indexed _date);

    event SetRevealDate(uint64 indexed _date);

    event Withdraw(uint256 indexed _dateWithdrew, uint256 _amount);

    ///////////////////////////////////////////////
    /// Constructor
    //////////////////////////////////////////////

    constructor(
        uint256 _price,
        uint32 _maxTokenPerWallet,
        uint64 _presaleDate,
        uint64 _publicSaleDate,
        uint64 _revealDate,
        bytes32 _ogMerkleRoot,
        bytes32 _wlMerkleRoot,
        string memory _metadataBaseURI
    ) ERC721Base("Who Is Who", "WhoIsWho") {
        price = _price;
        maxTokenPerWallet = _maxTokenPerWallet;
        ogMerkleRoot = _ogMerkleRoot;
        wlMerkleRoot = _wlMerkleRoot;
        metadataBaseURI = _metadataBaseURI;

        /**
         * @notice Initial presale, public, and reveal dates are set during contract's deployment.
         * These are changeable variables; this might change after the contract has been deployed
         */
        presaleDate = _presaleDate;
        publicSaleDate = _publicSaleDate;
        revealDate = _revealDate;

        for (uint256 i = 0; i < RESERVED_TOKENS; ) {
            safeMint(_msgSender());
            unchecked {
                ++i;
            }
        }
    }

    ///////////////////////////////////////////////
    /// Modifiers
    //////////////////////////////////////////////
    modifier stageCompliance(SaleStage _stage) {
        SaleStage stage = getSaleStage();

        if (stage != _stage) {
            revert WhoIsWho__StageNotReady();
        }
        _;
    }

    /**
     * @dev THIS MODIFIER SHOULD BE STRICTLY PLACED FIRST AMONG ALL OTHER RELATED
     * MINT COMPLIANCE MODIFIERS TO AVOID OVERFLOW ON THE `_mintAmount` VARIABLE.
     */
    modifier mintCompliance(uint256 _mintAmount, uint256 _maxTokenPerMint) {
        if (_mintAmount > _maxTokenPerMint) {
            revert WhoIsWho__MaxMint();
        }

        if (_mintAmount == 0) {
            revert WhoIsWho__ZeroMintAmount();
        }

        /**
         * @dev Overflow is impossible because `_mintAmount` is check first if it
         * is greater than `_maxTokenPerMint` and `_maxTokenPerMint` is static
         */
        unchecked {
            uint256 totalSupplyAfterMint = totalSupply() + _mintAmount;
            if (totalSupplyAfterMint > TOTAL_SUPPLY) {
                revert WhoIsWho__MaxMint();
            }
        }
        _;
    }

    modifier mintComplianceForPresale(uint256 _mintAmount, uint256 _presaleMaxTokenPerMint) {
        /**
         * @dev Overflow is impossible because `_mintAmount` is validated first in the
         * `mintCompliance` modifier
         */
        unchecked {
            uint256 totalBalanceAfterMint = balanceOf(_msgSender()) + _mintAmount;
            if (totalBalanceAfterMint > _presaleMaxTokenPerMint) {
                revert WhoIsWho__MaxMint();
            }
        }
        _;
    }

    modifier mintComplianceForPublicSale(uint256 _mintAmount) {
        /**
         * @dev Overflow is impossible because `_mintAmount` is validated first in the
         * `mintCompliance` modifier
         */
        unchecked {
            uint256 totalBalanceAfterMint = publicSaleBalances[_msgSender()] + _mintAmount;
            if (totalBalanceAfterMint > maxTokenPerWallet) {
                revert WhoIsWho__MaxMint();
            }
        }
        _;
    }

    modifier mintPriceCompliance(uint256 _mintAmount, uint256 _price) {
        /**
         * @dev Overflow is impossible because `_mintAmount` is validated first in the
         * `mintCompliance` modifier
         */
        unchecked {
            uint256 totalCost = _price * _mintAmount;
            if (totalCost > msg.value) {
                revert WhoIsWho__InsufficientFunds();
            }
        }
        _;
    }

    ///////////////////////////////////////////////
    /// Public methods
    //////////////////////////////////////////////

    function ogMint(
        uint256 _mintAmount,
        bytes32[] calldata _merkleProof
    )
        external
        payable
        nonReentrant
        stageCompliance(SaleStage.PRESALE_OG)
        mintCompliance(_mintAmount, PRESALE_MAX_TOKEN_PER_OG)
        mintComplianceForPresale(_mintAmount, PRESALE_MAX_TOKEN_PER_OG)
        mintPriceCompliance(_mintAmount, PRESALE_PRICE_OG)
    {
        bytes32 leaf = keccak256(abi.encodePacked(_msgSender()));
        if (!MerkleProof.verify(_merkleProof, ogMerkleRoot, leaf)) {
            revert WhoIsWho__InvalidProof();
        }

        for (uint256 i = 0; i < _mintAmount; ) {
            safeMint(_msgSender());
            unchecked {
                ++i;
            }
        }
    }

    function wlMint(
        uint256 _mintAmount,
        bytes32[] calldata _merkleProof
    )
        external
        payable
        nonReentrant
        stageCompliance(SaleStage.PRESALE_WL)
        mintCompliance(_mintAmount, PRESALE_MAX_TOKEN_PER_WL)
        mintComplianceForPresale(_mintAmount, PRESALE_MAX_TOKEN_PER_WL)
        mintPriceCompliance(_mintAmount, PRESALE_PRICE_WL)
    {
        bytes32 leaf = keccak256(abi.encodePacked(_msgSender()));
        if (!MerkleProof.verify(_merkleProof, wlMerkleRoot, leaf)) {
            revert WhoIsWho__InvalidProof();
        }

        for (uint256 i = 0; i < _mintAmount; ) {
            safeMint(_msgSender());
            unchecked {
                ++i;
            }
        }
    }

    function mint(
        uint256 _mintAmount
    )
        external
        payable
        nonReentrant
        stageCompliance(SaleStage.PUBLIC_SALE)
        mintCompliance(_mintAmount, maxTokenPerWallet)
        mintComplianceForPublicSale(_mintAmount)
        mintPriceCompliance(_mintAmount, price)
    {
        for (uint256 i = 0; i < _mintAmount; ) {
            publicSaleBalances[_msgSender()]++;
            safeMint(_msgSender());
            unchecked {
                ++i;
            }
        }
    }

    function tokenURI(uint256 _tokenId) public view virtual override returns (string memory) {
        if (!_exists(_tokenId)) {
            revert WhoIsWho__NonExistentTokenId();
        }

        if (!isReveal()) {
            return hiddenMetadataUri();
        }

        string memory currentBaseURI = _baseURI();

        if (bytes(currentBaseURI).length > 0) {
            return string(abi.encodePacked(currentBaseURI, _tokenId.toString(), ".json"));
        }

        return "";
    }

    function hiddenMetadataUri() public view returns (string memory) {
        string memory currentBaseURI = _baseURI();

        if (bytes(currentBaseURI).length > 0) {
            return string(abi.encodePacked(currentBaseURI, "hidden.json"));
        }

        return "";
    }

    function getSaleStage() public view returns (SaleStage stage) {
        uint256 timeNow = block.timestamp;

        if (timeNow >= publicSaleDate) {
            return SaleStage.PUBLIC_SALE;
        }

        uint64 interval;

        /**
         * @dev Overflow is impossible because `presaleDate` is set by the admin and
         * `PRESALE_INTERVAL` is a constant
         */
        unchecked {
            /**
             * @dev Adding `PRESALE_INTERVAL` to the presale date, it means that the minting
             * timeframe for OG members has elapsed
             */
            interval = presaleDate + PRESALE_INTERVAL;
        }

        if (timeNow >= interval) {
            return SaleStage.PRESALE_WL;
        }

        /**
         * @dev During presale, OG members will have the first access to minting their
         * tokens, followed by whitelist members who can start minting only after a
         * specified time period defined in `PRESALE_INTERVAL`
         */
        if (timeNow >= presaleDate) {
            return SaleStage.PRESALE_OG;
        }

        return SaleStage.IDLE;
    }

    ///////////////////////////////////////////////
    /// Internal methods
    //////////////////////////////////////////////

    function isReveal() internal view returns (bool) {
        return uint64(block.timestamp) >= revealDate;
    }

    function _baseURI() internal view virtual override returns (string memory) {
        return metadataBaseURI;
    }

    ///////////////////////////////////////////////
    /// Admin methods
    //////////////////////////////////////////////

    function mint(address _recipient, uint256 _mintAmount) external payable onlyOwner {
        publicSaleBalances[_msgSender()] = publicSaleBalances[_msgSender()] + _mintAmount;

        for (uint256 i = 0; i < _mintAmount; ) {
            safeMint(_recipient);
            ++i;
        }
    }

    function setPrice(uint256 _price) external onlyOwner {
        price = _price;
        emit SetPrice(_price);
    }

    function setMaxTokenPerWallet(uint32 _maxTokenPerWallet) external onlyOwner {
        maxTokenPerWallet = _maxTokenPerWallet;
        emit SetMaxTokenPerWallet(_maxTokenPerWallet);
    }

    function setMetadataBaseURI(string memory _uri) external onlyOwner {
        metadataBaseURI = _uri;
        emit SetMetadataBaseURI(_uri);
    }

    function setOgMerkleRoot(bytes32 _merkleRoot) external onlyOwner stageCompliance(SaleStage.IDLE) {
        ogMerkleRoot = _merkleRoot;
        emit SetOgMerkleRoot(_merkleRoot);
    }

    function setWlMerkleRoot(bytes32 _merkleRoot) external onlyOwner stageCompliance(SaleStage.IDLE) {
        wlMerkleRoot = _merkleRoot;
        emit SetWlMerkleRoot(_merkleRoot);
    }

    function setPresaleDate(uint64 _date) external onlyOwner stageCompliance(SaleStage.IDLE) {
        presaleDate = _date;
        emit SetPresaleDate(_date);
    }

    function setPublicSaleDate(uint64 _date) external onlyOwner stageCompliance(SaleStage.IDLE) {
        publicSaleDate = _date;
        emit SetPublicSaleDate(_date);
    }

    function setRevealDate(uint64 _date) external onlyOwner {
        revealDate = _date;
        emit SetRevealDate(_date);
    }

    function withdraw() external onlyOwner stageCompliance(SaleStage.PUBLIC_SALE) {
        string memory currentBaseURI = _baseURI();
        require(bytes(currentBaseURI).length > 0, "Base URI not set");
        (bool os, ) = payable(owner()).call{value: address(this).balance}("");
        require(os, "Transfer failed");
        emit Withdraw(block.timestamp, address(this).balance);
    }
}
